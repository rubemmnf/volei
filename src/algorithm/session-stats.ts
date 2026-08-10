import type { Match, Session } from "../types";

export type TeamStat = {
  teamIndex: number;
  wins: number;
  /** Sum of the winning margins of the matches this team won. Losses add nothing. */
  pointDiff: number;
};

/**
 * Per-team results of a session, in team order. Only won matches contribute:
 * a loss adds neither a win nor a negative margin.
 */
export function teamStats(session: Session): TeamStat[] {
  const empty: TeamStat[] = session.teams.map((_, teamIndex) => ({
    teamIndex,
    wins: 0,
    pointDiff: 0,
  }));

  return session.matches.reduce<TeamStat[]>((stats, match) => {
    const index = teamIndexForSide(session.teams, winningSide(match));
    if (index < 0) return stats;

    const margin = Math.abs(match.scoreA - match.scoreB);
    return stats.map((stat) =>
      stat.teamIndex === index
        ? { ...stat, wins: stat.wins + 1, pointDiff: stat.pointDiff + margin }
        : stat,
    );
  }, empty);
}

/**
 * Team indices that won the session: most wins, ties broken by point difference.
 * More than one index means a genuine tie; empty means no match was attributed.
 */
export function sessionWinners(stats: readonly TeamStat[]): number[] {
  const played = stats.filter((stat) => stat.wins > 0);
  if (played.length === 0) return [];

  const maxWins = Math.max(...played.map((stat) => stat.wins));
  const leaders = played.filter((stat) => stat.wins === maxWins);
  const maxPointDiff = Math.max(...leaders.map((stat) => stat.pointDiff));

  return leaders
    .filter((stat) => stat.pointDiff === maxPointDiff)
    .map((stat) => stat.teamIndex);
}

function winningSide(match: Match): string[] {
  return match.scoreA > match.scoreB ? match.sideA : match.sideB;
}

function teamIndexForSide(teams: Session["teams"], side: string[]): number {
  const exact = teams.findIndex(
    (team) => team.length === side.length && side.every((id) => team.includes(id)),
  );
  if (exact >= 0) return exact;

  // A swap applied mid-session rewrites session.teams, so a side stored before it no
  // longer equals any team. Credit the team that kept a strict majority of that side;
  // less overlap than that is too ambiguous to attribute, so the match is skipped.
  const overlaps = teams.map((team) => side.filter((id) => team.includes(id)).length);
  const best = overlaps.indexOf(Math.max(...overlaps));
  return overlaps[best] * 2 > side.length ? best : -1;
}
