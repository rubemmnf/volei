import type { Player } from "../types";
import { teamElo } from "./elo";
import { getPartitions } from "./partitions";
import { teamFamiliarity, type FamiliarityMatrix } from "./familiarity";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

type WeightSettings = Pick<Settings, "familiarityWeight">;

/**
 * Picks the lowest-cost partition of 12 players into 3 teams of 4,
 * where cost = variance of team Elo sums + weighted familiarity penalty.
 *
 * `familiarityWeight` is the price of one fully-decayed familiar pair, in
 * Elo-sum-variance units: at the default 1000, breaking up one recent pair is
 * worth accepting roughly a 45-point spread in team Elo sums.
 */
export function generateTeams(
  players: Player[],
  matrix: FamiliarityMatrix,
  { familiarityWeight }: WeightSettings = DEFAULT_SETTINGS,
): [Player[], Player[], Player[]] {
  let best: [Player[], Player[], Player[]] | null = null;
  let lowestCost = Infinity;

  for (const partition of getPartitions(players)) {
    const cost = partitionCost(partition, matrix, familiarityWeight);
    if (cost < lowestCost) {
      lowestCost = cost;
      best = partition;
    }
  }

  return best!;
}

function partitionCost(
  partition: [Player[], Player[], Player[]],
  matrix: FamiliarityMatrix,
  familiarityWeight: number,
): number {
  const sums = partition.map(teamElo);
  const mean = (sums[0] + sums[1] + sums[2]) / 3;
  const variance = sums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / 3;

  const familiarity = partition.reduce(
    (sum, team) => sum + teamFamiliarity(team.map((p) => p.id), matrix),
    0,
  );

  return variance + familiarityWeight * familiarity;
}
