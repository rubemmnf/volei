import type { AppState, Player, StoredPlayer } from "../types";
import { computeEloDeltas } from "./elo";

/**
 * Replays every recorded match, in order, on top of each player's `baseElo`.
 *
 * Elo is derived rather than stored so a score can be corrected after the fact:
 * every later match's delta was computed from the rating the earlier match
 * produced, so a correction has to propagate forward. Replay does that for free.
 */
export function deriveRatings(state: AppState): Player[] {
  const rated = new Map<string, Player>(
    state.players.map((p) => [p.id, withElo(p, p.baseElo)]),
  );

  for (const session of state.sessions) {
    for (const match of session.matches) {
      // A player can be removed from the roster while their matches remain.
      // Skip the match rather than crash — the surviving sides keep their rating.
      const sideA = resolve(match.sideA, rated);
      const sideB = resolve(match.sideB, rated);
      if (!sideA || !sideB) continue;

      const { deltaA, deltaB } = computeEloDeltas(sideA, sideB, match.scoreA, match.scoreB);
      for (const p of sideA) rated.set(p.id, withElo(p, p.elo + deltaA));
      for (const p of sideB) rated.set(p.id, withElo(p, p.elo + deltaB));
    }
  }

  // Preserve roster order so callers can swap `state.players` for this directly.
  return state.players.map((p) => rated.get(p.id)!);
}

function resolve(ids: string[], rated: Map<string, Player>): Player[] | null {
  const players = ids.map((id) => rated.get(id));
  if (players.some((p) => p === undefined)) return null;
  return players as Player[];
}

function withElo(player: StoredPlayer, elo: number): Player {
  return { ...player, elo };
}
