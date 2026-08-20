import type { Player } from "../types";
import { teamElo } from "./elo";

const TEAM_SIZE = 4;
const DEFAULT_LIMIT = 3;

/** Every pair of teams, in the order the organizer reads them. */
export const TEAM_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

/**
 * A 1-for-1 swap between two teams, described by how much it disturbs them.
 * `shift` is how far each team total moves (in opposite directions);
 * `gapAfter` is the distance between the two totals once swapped.
 */
export type BalancedSwap = {
  fromX: Player;
  fromY: Player;
  shift: number;
  gapAfter: number;
};

/**
 * The swaps that leave the team totals as close to untouched as possible,
 * best first. Sorted by ascending `shift`, tie-breaking on the smaller
 * resulting gap — for moving a player for social reasons without undoing
 * the balance the generator found.
 *
 * Note this is a different objective from `suggestSwap`, which hunts for the
 * swap that most evens out already-lopsided teams.
 */
export function suggestBalancedSwaps(
  teamX: Player[],
  teamY: Player[],
  limit = DEFAULT_LIMIT,
): BalancedSwap[] {
  if (teamX.length !== TEAM_SIZE || teamY.length !== TEAM_SIZE) {
    throw new Error(`Both teams must have exactly ${TEAM_SIZE} players`);
  }

  const gap = teamElo(teamX) - teamElo(teamY);

  const options: BalancedSwap[] = [];
  for (const fromX of teamX) {
    for (const fromY of teamY) {
      const delta = fromX.elo - fromY.elo;
      options.push({
        fromX,
        fromY,
        shift: Math.abs(delta),
        gapAfter: Math.abs(gap - 2 * delta),
      });
    }
  }

  options.sort((a, b) => a.shift - b.shift || a.gapAfter - b.gapAfter);
  return options.slice(0, limit);
}
