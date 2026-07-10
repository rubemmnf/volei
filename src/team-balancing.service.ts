import { Injectable } from '@nestjs/common';
import { PrismaClient, Player } from '@prisma/client';

@Injectable()
export class TeamBalancingService {
  // Configurable weights for the cost function
  private readonly WEIGHT_SKILL_VARIANCE = 1.0;
  private readonly WEIGHT_FAMILIARITY = 50.0; // Adjust based on how heavily you want to penalize familiarity

  constructor(private prisma: PrismaClient) {}

  /**
   * Generates optimal 3 teams of 4 players from a list of 12 player IDs.
   */
  async generateInitialTeams(playerIds: string[]): Promise<[Player[], Player[], Player[]]> {
    if (playerIds.length !== 12) {
      throw new Error('Exactly 12 player IDs are required to generate 3 teams of 4.');
    }

    // 1. Fetch players and their match histories in parallel
    const [players, rosters] = await Promise.all([
      this.prisma.player.findMany({ where: { id: { in: playerIds } } }),
      this.prisma.matchRoster.findMany({ where: { playerId: { in: playerIds } } }),
    ]);

    if (players.length !== 12) {
      throw new Error('Could not find all 12 players in the database.');
    }

    // 2. Build Familiarity Matrix and check matches played
    const familiarityMatrix = this.buildFamiliarityMatrix(rosters);
    const matchesPlayedCount = this.getMatchesPlayedCount(rosters);

    // 3. Normalize Effective Elo for each player
    const playersWithEffectiveElo = players.map(p => {
      const matchesPlayed = matchesPlayedCount[p.id] || 0;
      let effectiveElo = p.eloRating;
      
      // If they have default Elo and are new, map their 1-10 rating to 800-1600 Elo
      if (p.eloRating === 1200 && matchesPlayed === 0) {
        effectiveElo = this.mapMedianToElo(p.medianSkillRating);
      }

      return { ...p, effectiveElo };
    });

    // 4. Generate all 5,775 valid permutations (combinations of 3 teams of 4)
    const partitions = this.getPartitions(playersWithEffectiveElo);

    // 5. Evaluate permutations to find the lowest cost
    let bestPartition: [Player[], Player[], Player[]] | null = null;
    let lowestCost = Infinity;

    for (const partition of partitions) {
      const teamElos = partition.map(team => team.reduce((sum, p) => sum + (p as any).effectiveElo, 0));
      
      // Calculate Skill Variance (Standard Deviation/Variance proxy)
      const meanElo = teamElos.reduce((a, b) => a + b, 0) / 3;
      const skillVariance = teamElos.reduce((sum, elo) => sum + Math.pow(elo - meanElo, 2), 0) / 3;

      // Calculate Familiarity Penalty (sum of all pairwise familiarities in the teams)
      let familiarityPenalty = 0;
      for (const team of partition) {
        familiarityPenalty += this.calculateTeamFamiliarity(team, familiarityMatrix);
      }

      // Total Cost
      const totalCost = (skillVariance * this.WEIGHT_SKILL_VARIANCE) + (familiarityPenalty * this.WEIGHT_FAMILIARITY);

      if (totalCost < lowestCost) {
        lowestCost = totalCost;
        bestPartition = partition;
      }
    }

    return bestPartition!;
  }

  /**
   * Calculates the optimal 1-on-1 swap between a winning and losing team.
   */
  async calculateRebalancingSwap(teamW: Player[], teamL: Player[]): Promise<{ swapW: Player; swapL: Player }> {
    if (teamW.length !== 4 || teamL.length !== 4) {
      throw new Error('Both teams must have exactly 4 players.');
    }

    const allPlayerIds = [...teamW, ...teamL].map(p => p.id);
    const rosters = await this.prisma.matchRoster.findMany({ where: { playerId: { in: allPlayerIds } } });
    const familiarityMatrix = this.buildFamiliarityMatrix(rosters);

    let bestSwap: { swapW: Player; swapL: Player } | null = null;
    let minimalSkillDiff = Infinity;
    let minimalFamPenalty = Infinity;

    const baseTeamWElo = teamW.reduce((sum, p) => sum + p.eloRating, 0);
    const baseTeamLElo = teamL.reduce((sum, p) => sum + p.eloRating, 0);

    for (const pW of teamW) {
      for (const pL of teamL) {
        // Calculate new team skill totals if pW and pL are swapped
        const newWElo = baseTeamWElo - pW.eloRating + pL.eloRating;
        const newLElo = baseTeamLElo - pL.eloRating + pW.eloRating;
        const skillDiff = Math.abs(newWElo - newLElo);

        // Tie-breaker: Calculate familiarity on the hypothetical new teams
        const tempTeamW = [...teamW.filter(p => p.id !== pW.id), pL];
        const tempTeamL = [...teamL.filter(p => p.id !== pL.id), pW];
        const famPenalty = this.calculateTeamFamiliarity(tempTeamW, familiarityMatrix) + 
                           this.calculateTeamFamiliarity(tempTeamL, familiarityMatrix);

        if (skillDiff < minimalSkillDiff || (skillDiff === minimalSkillDiff && famPenalty < minimalFamPenalty)) {
          minimalSkillDiff = skillDiff;
          minimalFamPenalty = famPenalty;
          bestSwap = { swapW: pW, swapL: pL };
        }
      }
    }

    return bestSwap!;
  }

  // --- Helper Methods ---

  /**
   * Maps a 1-10 skill rating to an 800-1600 Elo scale.
   */
  private mapMedianToElo(medianRating: number): number {
    const minRating = 1;
    const maxRating = 10;
    const minElo = 800;
    const maxElo = 1600;

    // Clamp between 1 and 10 just in case
    const clampedRating = Math.max(minRating, Math.min(maxRating, medianRating));
    const percentage = (clampedRating - minRating) / (maxRating - minRating);
    
    return Math.round(minElo + (percentage * (maxElo - minElo)));
  }

  /**
   * Builds a matrix tracking how often players have played on the same team.
   */
  private buildFamiliarityMatrix(rosters: { playerId: string; matchId: string; team: string }[]): Record<string, number> {
    const matrix: Record<string, number> = {};
    
    // Group rosters by matchId + team
    const matchTeams: Record<string, string[]> = {};
    for (const r of rosters) {
      const key = `${r.matchId}_${r.team}`;
      if (!matchTeams[key]) matchTeams[key] = [];
      matchTeams[key].push(r.playerId);
    }

    // Count pairwise combinations
    for (const players of Object.values(matchTeams)) {
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const pairKey = this.getPairKey(players[i], players[j]);
          matrix[pairKey] = (matrix[pairKey] || 0) + 1;
        }
      }
    }

    return matrix;
  }

  private getMatchesPlayedCount(rosters: { playerId: string }[]): Record<string, number> {
    return rosters.reduce((acc, curr) => {
      acc[curr.playerId] = (acc[curr.playerId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getPairKey(id1: string, id2: string): string {
    return [id1, id2].sort().join('_');
  }

  private calculateTeamFamiliarity(team: Player[], matrix: Record<string, number>): number {
    let penalty = 0;
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        penalty += matrix[this.getPairKey(team[i].id, team[j].id)] || 0;
      }
    }
    return penalty;
  }

  /**
   * Generates all unique partitions of 12 players into 3 teams of 4.
   * This yields exactly 5,775 combinations.
   */
  private getPartitions<T>(players: T[]): [T[], T[], T[]][] {
    const partitions: [T[], T[], T[]][] = [];
    const p1 = players[0];
    const rest1 = players.slice(1);
    
    // Choose 3 from remaining 11 to form Team 1 (165 combinations)
    const team1Combos = this.getCombinations(rest1, 3);
    for (const t1 of team1Combos) {
      const team1 = [p1, ...t1.combo];
      const remaining8 = t1.remaining;
      
      const p2 = remaining8[0];
      const rest2 = remaining8.slice(1);
      
      // Choose 3 from remaining 7 to form Team 2 (35 combinations)
      const team2Combos = this.getCombinations(rest2, 3);
      for (const t2 of team2Combos) {
        const team2 = [p2, ...t2.combo];
        const team3 = t2.remaining; // The last 4 automatically form Team 3
        
        partitions.push([team1, team2, team3]);
      }
    }
    
    return partitions;
  }

  /**
   * Utility to find all combinations of size N from an array, returning both the combination and the remaining elements.
   */
  private getCombinations<T>(array: T[], size: number): { combo: T[], remaining: T[] }[] {
    if (size === 0) return [{ combo: [], remaining: array }];
    if (array.length === size) return [{ combo: [...array], remaining: [] }];
    if (array.length < size) return [];
    
    const first = array[0];
    const rest = array.slice(1);
    
    // Combinations that INCLUDE the first element
    const withFirst = this.getCombinations(rest, size - 1).map(c => ({
      combo: [first, ...c.combo],
      remaining: c.remaining
    }));
    
    // Combinations that EXCLUDE the first element
    const withoutFirst = this.getCombinations(rest, size).map(c => ({
      combo: c.combo,
      remaining: [first, ...c.remaining]
    }));
    
    return [...withFirst, ...withoutFirst];
  }
}
