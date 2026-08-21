import type { Player } from "../types";
import { teamElo } from "./elo";
import { teamFamiliarity, type FamiliarityMatrix } from "./familiarity";

const TEAM_SIZE = 4;
const DEFAULT_LIMIT = 3;

export type SwapSuggestion = { fromX: Player; fromY: Player };

/** A candidate swap with the numbers that decide its rank. */
export type RankedSwap = SwapSuggestion & {
  /** Distance between the two effective totals once swapped. */
  gapAfter: number;
  /** Combined familiarity of both teams once swapped — lower means fresher pairings. */
  familiarityAfter: number;
  /** Whether this swap actually leaves the two teams closer than they are now. */
  improves: boolean;
};

export type RankSwapsOptions = {
  limit?: number;
  /**
   * Elo-sum offsets applied to each team before ranking — how `session-stats.formBias`
   * feeds tonight's results in. Rating alone cannot see a team running away with the
   * night, because a win moves every player on a side by the same amount and so never
   * changes who is stronger than whom.
   */
  biasX?: number;
  biasY?: number;
};

/**
 * The 1-for-1 swaps that most even out two teams, best first: ascending post-swap
 * gap, tie-breaking on lower combined familiarity.
 *
 * Every candidate is returned, `improves` marking the ones that beat the current
 * gap. A pair of teams no swap can improve still gets its least uneven options —
 * an empty list would be a dead end for an organizer who has to change something.
 */
export function rankSwaps(
  teamX: Player[],
  teamY: Player[],
  matrix: FamiliarityMatrix,
  { limit = DEFAULT_LIMIT, biasX = 0, biasY = 0 }: RankSwapsOptions = {},
): RankedSwap[] {
  if (teamX.length !== TEAM_SIZE || teamY.length !== TEAM_SIZE) {
    throw new Error(`Both teams must have exactly ${TEAM_SIZE} players`);
  }

  const sumX = teamElo(teamX) + biasX;
  const sumY = teamElo(teamY) + biasY;
  const gapNow = Math.abs(sumX - sumY);

  const options: RankedSwap[] = [];
  for (const fromX of teamX) {
    for (const fromY of teamY) {
      const gapAfter = Math.abs(sumX - fromX.elo + fromY.elo - (sumY - fromY.elo + fromX.elo));

      const newX = teamX.filter((p) => p.id !== fromX.id).map((p) => p.id);
      const newY = teamY.filter((p) => p.id !== fromY.id).map((p) => p.id);
      const familiarityAfter =
        teamFamiliarity([...newX, fromY.id], matrix) + teamFamiliarity([...newY, fromX.id], matrix);

      options.push({ fromX, fromY, gapAfter, familiarityAfter, improves: gapAfter < gapNow });
    }
  }

  options.sort((a, b) => a.gapAfter - b.gapAfter || a.familiarityAfter - b.familiarityAfter);
  return options.slice(0, limit);
}
