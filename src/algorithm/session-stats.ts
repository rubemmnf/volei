import type { Match, Session } from "../types";

export type TeamStat = {
  teamIndex: number;
  wins: number;
  losses: number;
  /** Sum of the winning margins of the matches this team won. Losses add nothing. */
  pointDiff: number;
  /** Every point this team scored in the counted matches, won or lost. */
  pointsFor: number;
};

/**
 * A team's record over the night so far, used to steer mid-session swaps.
 * Unlike `TeamStat` this nets losses out of the margin and counts every match,
 * so it answers "who is running away with tonight" rather than "who won".
 */
export type TeamForm = {
  teamIndex: number;
  wins: number;
  losses: number;
  /** Margins won minus margins lost. Negative for a team being run over. */
  netPoints: number;
};

/** One session boiled down to the numbers worth printing. */
export type SessionSummary = {
  totalMatches: number;
  totalPoints: number;
  biggestWin: { match: Match; margin: number; teamIndex: number } | null;
  /** Absent when fewer than two matches were counted — it would just repeat the biggest win. */
  closestMatch: { match: Match; margin: number } | null;
};

/**
 * The matches that decide the night. The opening balancing rounds are dropped:
 * they are real games everywhere else (ratings, history, familiarity), they just
 * do not decide who won.
 */
export function countedMatches(session: Session): Match[] {
  return session.matches.slice(session.balancingRounds);
}

/**
 * Per-team results of a session, in team order. A win adds the margin to
 * `pointDiff`; a loss adds neither a win nor a negative margin, only the points
 * that side actually scored. A match whose two sides cannot both be traced back
 * to distinct teams is too ambiguous to attribute and is skipped entirely.
 */
export function teamStats(session: Session): TeamStat[] {
  const empty: TeamStat[] = session.teams.map((_, teamIndex) => ({
    teamIndex,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    pointsFor: 0,
  }));

  return countedMatches(session).reduce<TeamStat[]>((stats, match) => {
    const winnerIndex = teamIndexForSide(session.teams, winningSide(match));
    const loserIndex = teamIndexForSide(session.teams, losingSide(match));
    if (winnerIndex < 0 || loserIndex < 0 || winnerIndex === loserIndex) return stats;

    const winnerScore = Math.max(match.scoreA, match.scoreB);
    const loserScore = Math.min(match.scoreA, match.scoreB);
    const margin = winnerScore - loserScore;

    return stats.map((stat) => {
      if (stat.teamIndex === winnerIndex) {
        return {
          ...stat,
          wins: stat.wins + 1,
          pointDiff: stat.pointDiff + margin,
          pointsFor: stat.pointsFor + winnerScore,
        };
      }
      if (stat.teamIndex === loserIndex) {
        return { ...stat, losses: stat.losses + 1, pointsFor: stat.pointsFor + loserScore };
      }
      return stat;
    });
  }, empty);
}

/**
 * The standings order: most wins, then the bigger point difference, then the most
 * points scored. Teams that tie on all three keep their team order. Returns a new
 * array — the input is left alone.
 */
export function rankTeams(stats: readonly TeamStat[]): TeamStat[] {
  return [...stats].sort(
    (a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff || b.pointsFor - a.pointsFor,
  );
}

/**
 * Team indices that won the session, using the standings order. More than one
 * index means a tie no criterion could break; empty means no match was attributed.
 */
export function sessionWinners(stats: readonly TeamStat[]): number[] {
  const played = stats.filter((stat) => stat.wins > 0);
  if (played.length === 0) return [];

  const [best] = rankTeams(played);
  return played
    .filter(
      (stat) =>
        stat.wins === best.wins &&
        stat.pointDiff === best.pointDiff &&
        stat.pointsFor === best.pointsFor,
    )
    .map((stat) => stat.teamIndex);
}

/** Session-wide numbers for the shared image: volume, the blowout and the thriller. */
export function sessionSummaryStats(session: Session): SessionSummary {
  const matches = countedMatches(session);

  const totalPoints = matches.reduce((total, match) => total + match.scoreA + match.scoreB, 0);
  const margin = (match: Match) => Math.abs(match.scoreA - match.scoreB);

  const biggest = matches.reduce<Match | null>(
    (best, match) => (best === null || margin(match) > margin(best) ? match : best),
    null,
  );
  const closest = matches.reduce<Match | null>(
    (best, match) => (best === null || margin(match) < margin(best) ? match : best),
    null,
  );

  return {
    totalMatches: matches.length,
    totalPoints,
    biggestWin: biggest
      ? {
          match: biggest,
          margin: margin(biggest),
          teamIndex: teamIndexForSide(session.teams, winningSide(biggest)),
        }
      : null,
    closestMatch: closest && matches.length > 1 ? { match: closest, margin: margin(closest) } : null,
  };
}

/**
 * Per-team record over EVERY match of the session, balancing rounds included.
 *
 * Deliberately not `countedMatches`: rebalancing the teams is exactly what the
 * balancing rounds are for, so a swap suggestion has to see them even though the
 * night's standings do not.
 */
export function teamForm(session: Session): TeamForm[] {
  return formOver(session, session.matches);
}

/**
 * The same shape as `teamForm` over the matches that decide the night, for the
 * standings the organizer reads mid-session.
 *
 * Not `teamStats`: that one only ever adds winning margins, which reads as a
 * leaderboard after the fact but hides how badly a team is being beaten right now.
 */
export function teamStandings(session: Session): TeamForm[] {
  return formOver(session, countedMatches(session));
}

function formOver(session: Session, matches: readonly Match[]): TeamForm[] {
  const empty: TeamForm[] = session.teams.map((_, teamIndex) => ({
    teamIndex,
    wins: 0,
    losses: 0,
    netPoints: 0,
  }));

  return matches.reduce<TeamForm[]>((form, match) => {
    const winnerIndex = teamIndexForSide(session.teams, winningSide(match));
    const loserIndex = teamIndexForSide(session.teams, losingSide(match));
    if (winnerIndex < 0 || loserIndex < 0 || winnerIndex === loserIndex) return form;

    const margin = Math.abs(match.scoreA - match.scoreB);

    return form.map((team) => {
      if (team.teamIndex === winnerIndex) {
        return { ...team, wins: team.wins + 1, netPoints: team.netPoints + margin };
      }
      if (team.teamIndex === loserIndex) {
        return { ...team, losses: team.losses + 1, netPoints: team.netPoints - margin };
      }
      return team;
    });
  }, empty);
}

/**
 * Tonight's record expressed as a team-Elo-sum offset, so the swap ranker can
 * weigh "this team keeps winning" against "this team is rated higher".
 *
 * A won match already moves a team's Elo sum by roughly 80-130 points, so pricing
 * one net win in the same range makes a 2-0 vs 0-2 pairing register clearly without
 * swamping a genuine rating difference. The points term only separates teams whose
 * win-loss records already tie.
 */
export const ELO_PER_NET_WIN = 100;
export const ELO_PER_NET_POINT = 5;

export function formBias(form: TeamForm): number {
  return ELO_PER_NET_WIN * (form.wins - form.losses) + ELO_PER_NET_POINT * form.netPoints;
}

/** Net wins at which a team counts as running away with the night. */
export const DOMINANCE_THRESHOLD = 2;

/**
 * The runaway leader and the team being run over, or null when the night is close
 * enough to leave alone. Both ends have to be extreme: a team on a streak against
 * two different opponents is the format working, not a broken pairing.
 */
export function lopsidedPairing(session: Session): { leader: number; trailer: number } | null {
  const net = (team: TeamForm) => team.wins - team.losses;
  const form = teamForm(session);

  const leader = form.reduce((best, team) => (net(team) > net(best) ? team : best));
  const trailer = form.reduce((worst, team) => (net(team) < net(worst) ? team : worst));

  if (leader.teamIndex === trailer.teamIndex) return null;
  if (net(leader) < DOMINANCE_THRESHOLD || net(trailer) > -DOMINANCE_THRESHOLD) return null;

  return { leader: leader.teamIndex, trailer: trailer.teamIndex };
}

function winningSide(match: Match): string[] {
  return match.scoreA > match.scoreB ? match.sideA : match.sideB;
}

function losingSide(match: Match): string[] {
  return match.scoreA > match.scoreB ? match.sideB : match.sideA;
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
