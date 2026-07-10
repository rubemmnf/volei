import type { Player } from "../types";
import { getPartitions } from "./partitions";
import { teamFamiliarity, type FamiliarityMatrix } from "./familiarity";

/**
 * Cost of one fully-decayed familiar pair, in Elo-sum-variance units.
 * At 1000, breaking up one recent pair is worth accepting roughly a
 * 45-point spread in team Elo sums.
 */
export const FAMILIARITY_WEIGHT = 1000;

/**
 * Picks the lowest-cost partition of 12 players into 3 teams of 4,
 * where cost = variance of team Elo sums + weighted familiarity penalty.
 */
export function generateTeams(
  players: Player[],
  matrix: FamiliarityMatrix,
): [Player[], Player[], Player[]] {
  let best: [Player[], Player[], Player[]] | null = null;
  let lowestCost = Infinity;

  for (const partition of getPartitions(players)) {
    const cost = partitionCost(partition, matrix);
    if (cost < lowestCost) {
      lowestCost = cost;
      best = partition;
    }
  }

  return best!;
}

function partitionCost(partition: [Player[], Player[], Player[]], matrix: FamiliarityMatrix): number {
  const sums = partition.map((team) => team.reduce((sum, p) => sum + p.elo, 0));
  const mean = (sums[0] + sums[1] + sums[2]) / 3;
  const variance = sums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / 3;

  const familiarity = partition.reduce(
    (sum, team) => sum + teamFamiliarity(team.map((p) => p.id), matrix),
    0,
  );

  return variance + FAMILIARITY_WEIGHT * familiarity;
}
