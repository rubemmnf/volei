import type { Match, Player, Session } from "../types";
import { TEAM_META } from "./team-meta";

/** One recorded match as a single score line: "Time A 25–19 Time B". */
export function matchLabel(match: Match, session: Session, playerById: Map<string, Player>): string {
  const a = sideName(match.sideA, session, playerById);
  const b = sideName(match.sideB, session, playerById);
  return `${a} ${match.scoreA}–${match.scoreB} ${b}`;
}

/** Team name for a side, falling back to player names once a swap breaks the match. */
export function sideName(
  side: string[],
  session: Session,
  playerById: Map<string, Player>,
): string {
  const index = session.teams.findIndex(
    (team) => team.length === side.length && side.every((id) => team.includes(id)),
  );
  if (index >= 0) return TEAM_META[index].name;
  return side.map((id) => playerById.get(id)?.name ?? "?").join("/");
}
