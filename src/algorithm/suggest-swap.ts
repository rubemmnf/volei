import type { Player } from "../types";
import { teamFamiliarity, type FamiliarityMatrix } from "./familiarity";

const TEAM_SIZE = 4;

export type SwapSuggestion = { fromX: Player; fromY: Player };

/**
 * Best 1-for-1 swap to even out two teams: minimizes the post-swap Elo-sum
 * gap, tie-breaking on lower combined familiarity. Returns null when no swap
 * improves on the current gap (teams already balanced).
 */
export function suggestSwap(
  teamX: Player[],
  teamY: Player[],
  matrix: FamiliarityMatrix,
): SwapSuggestion | null {
  if (teamX.length !== TEAM_SIZE || teamY.length !== TEAM_SIZE) {
    throw new Error(`Both teams must have exactly ${TEAM_SIZE} players`);
  }

  const sumX = teamX.reduce((sum, p) => sum + p.elo, 0);
  const sumY = teamY.reduce((sum, p) => sum + p.elo, 0);

  let best: SwapSuggestion | null = null;
  let bestDiff = Math.abs(sumX - sumY);
  let bestFamiliarity = Infinity;

  for (const px of teamX) {
    for (const py of teamY) {
      const diff = Math.abs(sumX - px.elo + py.elo - (sumY - py.elo + px.elo));

      const newX = teamX.filter((p) => p.id !== px.id).map((p) => p.id);
      const newY = teamY.filter((p) => p.id !== py.id).map((p) => p.id);
      const familiarity =
        teamFamiliarity([...newX, py.id], matrix) + teamFamiliarity([...newY, px.id], matrix);

      const strictlyBetter = diff < bestDiff;
      const tieButFresher = diff === bestDiff && best !== null && familiarity < bestFamiliarity;
      if (strictlyBetter || tieButFresher) {
        best = { fromX: px, fromY: py };
        bestDiff = diff;
        bestFamiliarity = familiarity;
      }
    }
  }

  return best;
}
