import type { Player } from "../types";
import { teamElo } from "./elo";
import { teamFamiliarity, type FamiliarityMatrix } from "./familiarity";

const TEAM_SIZE = 4;
const DEFAULT_LIMIT = 3;

export type SwapSuggestion = { fromX: Player; fromY: Player };

/** A candidate swap with the two numbers that decide its rank. */
export type RankedSwap = SwapSuggestion & {
  /** Distance between the two Elo sums once swapped. */
  gapAfter: number;
  /** Combined familiarity of both teams once swapped — lower means fresher pairings. */
  familiarityAfter: number;
};

/**
 * The 1-for-1 swaps that most even out two teams, best first: ascending
 * post-swap Elo-sum gap, tie-breaking on lower combined familiarity. Swaps that
 * do not improve on the current gap are left out, so an already balanced pair of
 * teams yields an empty list.
 */
export function rankSwaps(
  teamX: Player[],
  teamY: Player[],
  matrix: FamiliarityMatrix,
  limit = DEFAULT_LIMIT,
): RankedSwap[] {
  if (teamX.length !== TEAM_SIZE || teamY.length !== TEAM_SIZE) {
    throw new Error(`Both teams must have exactly ${TEAM_SIZE} players`);
  }

  const sumX = teamElo(teamX);
  const sumY = teamElo(teamY);
  const gapNow = Math.abs(sumX - sumY);

  const options: RankedSwap[] = [];
  for (const fromX of teamX) {
    for (const fromY of teamY) {
      const gapAfter = Math.abs(sumX - fromX.elo + fromY.elo - (sumY - fromY.elo + fromX.elo));
      if (gapAfter >= gapNow) continue;

      const newX = teamX.filter((p) => p.id !== fromX.id).map((p) => p.id);
      const newY = teamY.filter((p) => p.id !== fromY.id).map((p) => p.id);
      const familiarityAfter =
        teamFamiliarity([...newX, fromY.id], matrix) + teamFamiliarity([...newY, fromX.id], matrix);

      options.push({ fromX, fromY, gapAfter, familiarityAfter });
    }
  }

  options.sort((a, b) => a.gapAfter - b.gapAfter || a.familiarityAfter - b.familiarityAfter);
  return options.slice(0, limit);
}

/**
 * The single best swap to even out two teams, or null when no swap improves on
 * the current gap (teams already balanced).
 */
export function suggestSwap(
  teamX: Player[],
  teamY: Player[],
  matrix: FamiliarityMatrix,
): SwapSuggestion | null {
  return rankSwaps(teamX, teamY, matrix, 1)[0] ?? null;
}
