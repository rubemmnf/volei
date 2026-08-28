import { describe, expect, test } from "vitest";
import type { Match, Session } from "../types";
import {
  DOMINANCE_THRESHOLD,
  formBias,
  lopsidedPairing,
  rankTeams,
  sessionSummaryStats,
  sessionWinners,
  teamForm,
  teamStandings,
  teamStats,
} from "./session-stats";

const TEAMS: Session["teams"] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

function match(
  id: string,
  sideA: string[],
  sideB: string[],
  scoreA: number,
  scoreB: number,
): Match {
  return { id, sideA, sideB, scoreA, scoreB, timestamp: id };
}

function session(
  matches: Match[],
  teams: Session["teams"] = TEAMS,
  balancingRounds = 0,
): Session {
  return {
    id: "s1",
    date: "2026-07-10",
    teams,
    matches,
    finished: true,
    balancingRounds,
    rebalanceMuted: false,
  };
}

function stat(
  teamIndex: number,
  wins: number,
  losses: number,
  pointDiff: number,
  pointsFor: number,
) {
  return { teamIndex, wins, losses, pointDiff, pointsFor };
}

describe("teamStats", () => {
  test("credits the winning team with one win and the winning margin", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)]));

    expect(stats[0]).toEqual(stat(0, 1, 0, 6, 25));
  });

  test("a loss adds a loss and the points scored, but no negative point difference", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)]));

    expect(stats[1]).toEqual(stat(1, 0, 1, 0, 19));
  });

  test("credits the winner when the winning team is on side B", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[2], 18, 25)]));

    expect(stats[2]).toEqual(stat(2, 1, 0, 7, 25));
    expect(stats[0]).toEqual(stat(0, 0, 1, 0, 18));
  });

  test("accumulates wins, losses, margins and points across matches", () => {
    const stats = teamStats(
      session([
        match("m1", TEAMS[0], TEAMS[1], 25, 19),
        match("m2", TEAMS[2], TEAMS[0], 20, 25),
        match("m3", TEAMS[1], TEAMS[2], 25, 23),
      ]),
    );

    expect(stats).toEqual([stat(0, 2, 0, 11, 50), stat(1, 1, 1, 2, 44), stat(2, 0, 2, 0, 43)]);
  });

  test("returns three zeroed rows for a session with no matches", () => {
    expect(teamStats(session([]))).toEqual([
      stat(0, 0, 0, 0, 0),
      stat(1, 0, 0, 0, 0),
      stat(2, 0, 0, 0, 0),
    ]);
  });

  test("attributes a match recorded before a swap to the team that kept most of its players", () => {
    // p1 and p5 were swapped after the match was recorded, so the stored side
    // matches no current team exactly.
    const swapped: Session["teams"] = [
      ["p2", "p3", "p4", "p5"],
      ["p6", "p7", "p8", "p1"],
      ["p9", "p10", "p11", "p12"],
    ];
    const stats = teamStats(
      session([match("m1", ["p1", "p2", "p3", "p4"], ["p5", "p6", "p7", "p8"], 25, 21)], swapped),
    );

    expect(stats[0]).toEqual(stat(0, 1, 0, 4, 25));
    expect(stats[1]).toEqual(stat(1, 0, 1, 0, 21));
  });

  test("excludes the balancing rounds — only matches after the first N count", () => {
    const stats = teamStats(
      session(
        [
          match("m1", TEAMS[0], TEAMS[1], 25, 19),
          match("m2", TEAMS[0], TEAMS[2], 25, 20),
          match("m3", TEAMS[1], TEAMS[2], 25, 23),
        ],
        TEAMS,
        2,
      ),
    );

    expect(stats).toEqual([stat(0, 0, 0, 0, 0), stat(1, 1, 0, 2, 25), stat(2, 0, 1, 0, 23)]);
  });

  test("zero balancing rounds counts every match", () => {
    const matches = [match("m1", TEAMS[0], TEAMS[1], 25, 19)];

    expect(teamStats(session(matches, TEAMS, 0))).toEqual(teamStats(session(matches)));
  });

  test("more balancing rounds than matches leaves nothing to count", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)], TEAMS, 3));

    expect(stats).toEqual([stat(0, 0, 0, 0, 0), stat(1, 0, 0, 0, 0), stat(2, 0, 0, 0, 0)]);
    expect(sessionWinners(stats)).toEqual([]);
  });

  test("skips a match whose sides cannot both be traced back to a team", () => {
    const stats = teamStats(
      session([match("m1", ["p1", "p2", "p5", "p6"], ["p9", "p10", "p11", "p12"], 25, 21)]),
    );

    expect(stats).toEqual([stat(0, 0, 0, 0, 0), stat(1, 0, 0, 0, 0), stat(2, 0, 0, 0, 0)]);
  });
});

describe("rankTeams", () => {
  test("orders by wins first", () => {
    const ranked = rankTeams([stat(0, 1, 1, 30, 90), stat(1, 2, 0, 4, 50), stat(2, 0, 2, 0, 40)]);

    expect(ranked.map((s) => s.teamIndex)).toEqual([1, 0, 2]);
  });

  test("breaks a tie on wins with the bigger point difference", () => {
    const ranked = rankTeams([stat(0, 2, 0, 4, 99), stat(1, 2, 0, 9, 50), stat(2, 0, 2, 0, 40)]);

    expect(ranked.map((s) => s.teamIndex)).toEqual([1, 0, 2]);
  });

  test("breaks a tie on wins and point difference with the points scored", () => {
    const ranked = rankTeams([stat(0, 2, 0, 5, 48), stat(1, 2, 0, 5, 50), stat(2, 0, 2, 0, 40)]);

    expect(ranked.map((s) => s.teamIndex)).toEqual([1, 0, 2]);
  });

  test("keeps team order when every criterion ties", () => {
    const ranked = rankTeams([stat(0, 1, 1, 5, 45), stat(1, 1, 1, 5, 45), stat(2, 1, 1, 5, 45)]);

    expect(ranked.map((s) => s.teamIndex)).toEqual([0, 1, 2]);
  });

  test("does not mutate the stats it was given", () => {
    const stats = [stat(0, 0, 1, 0, 20), stat(1, 3, 0, 12, 75)];

    rankTeams(stats);

    expect(stats.map((s) => s.teamIndex)).toEqual([0, 1]);
  });
});

describe("sessionWinners", () => {
  test("returns the team with the most wins", () => {
    const winners = sessionWinners([
      stat(0, 2, 0, 4, 50),
      stat(1, 1, 1, 30, 90),
      stat(2, 0, 2, 0, 40),
    ]);

    expect(winners).toEqual([0]);
  });

  test("breaks a tie on wins with the bigger point difference", () => {
    const winners = sessionWinners([
      stat(0, 2, 0, 4, 99),
      stat(1, 2, 0, 9, 50),
      stat(2, 0, 2, 0, 40),
    ]);

    expect(winners).toEqual([1]);
  });

  test("breaks a tie on wins and point difference with the points scored", () => {
    const winners = sessionWinners([
      stat(0, 2, 0, 5, 48),
      stat(1, 2, 0, 5, 50),
      stat(2, 0, 2, 0, 40),
    ]);

    expect(winners).toEqual([1]);
  });

  test("returns every tied team when all three criteria are equal", () => {
    const winners = sessionWinners([
      stat(0, 1, 1, 5, 45),
      stat(1, 1, 1, 5, 45),
      stat(2, 1, 1, 2, 45),
    ]);

    expect(winners).toEqual([0, 1]);
  });

  test("returns no winner when no match was played", () => {
    const winners = sessionWinners([
      stat(0, 0, 0, 0, 0),
      stat(1, 0, 0, 0, 0),
      stat(2, 0, 0, 0, 0),
    ]);

    expect(winners).toEqual([]);
  });
});

describe("sessionSummaryStats", () => {
  const MATCHES = [
    match("m1", TEAMS[0], TEAMS[1], 25, 19),
    match("m2", TEAMS[2], TEAMS[0], 20, 25),
    match("m3", TEAMS[1], TEAMS[2], 25, 24),
  ];

  test("counts the matches and every point scored in them", () => {
    const summary = sessionSummaryStats(session(MATCHES));

    expect(summary.totalMatches).toBe(3);
    expect(summary.totalPoints).toBe(25 + 19 + 20 + 25 + 25 + 24);
  });

  test("reports the biggest win with its margin and winning team", () => {
    const summary = sessionSummaryStats(session(MATCHES));

    expect(summary.biggestWin).toEqual({ match: MATCHES[0], margin: 6, teamIndex: 0 });
  });

  test("reports the closest match", () => {
    const summary = sessionSummaryStats(session(MATCHES));

    expect(summary.closestMatch).toEqual({ match: MATCHES[2], margin: 1 });
  });

  test("has no closest match when a single match was counted", () => {
    const summary = sessionSummaryStats(session([MATCHES[0]]));

    expect(summary.biggestWin).toEqual({ match: MATCHES[0], margin: 6, teamIndex: 0 });
    expect(summary.closestMatch).toBeNull();
  });

  test("ignores the balancing rounds", () => {
    const summary = sessionSummaryStats(session(MATCHES, TEAMS, 2));

    expect(summary.totalMatches).toBe(1);
    expect(summary.totalPoints).toBe(49);
    expect(summary.biggestWin).toEqual({ match: MATCHES[2], margin: 1, teamIndex: 1 });
    expect(summary.closestMatch).toBeNull();
  });

  test("reports nothing for a session with no counted matches", () => {
    const summary = sessionSummaryStats(session([]));

    expect(summary).toEqual({
      totalMatches: 0,
      totalPoints: 0,
      biggestWin: null,
      closestMatch: null,
    });
  });
});

describe("teamForm", () => {
  test("counts a win for one team and a loss for the other", () => {
    const form = teamForm(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)]));
    expect(form[0]).toEqual({ teamIndex: 0, wins: 1, losses: 0, netPoints: 6 });
    expect(form[1]).toEqual({ teamIndex: 1, wins: 0, losses: 1, netPoints: -6 });
    expect(form[2]).toEqual({ teamIndex: 2, wins: 0, losses: 0, netPoints: 0 });
  });

  test("counts the balancing rounds, unlike the standings", () => {
    const matches = [
      match("m1", TEAMS[0], TEAMS[1], 25, 19),
      match("m2", TEAMS[0], TEAMS[2], 25, 21),
    ];
    // Both matches are balancing rounds, so they decide nothing about the night...
    expect(teamStats(session(matches, TEAMS, 2))[0].wins).toBe(0);
    // ...but rebalancing during them is the whole point, so form still sees them.
    expect(teamForm(session(matches, TEAMS, 2))[0]).toEqual({
      teamIndex: 0,
      wins: 2,
      losses: 0,
      netPoints: 10,
    });
  });

  test("nets a win and a loss back to level", () => {
    const form = teamForm(
      session([
        match("m1", TEAMS[0], TEAMS[1], 25, 20),
        match("m2", TEAMS[2], TEAMS[0], 25, 20),
      ]),
    );
    expect(form[0]).toEqual({ teamIndex: 0, wins: 1, losses: 1, netPoints: 0 });
  });

  test("credits the team that kept a majority of a side after a swap", () => {
    const swapped: Session["teams"] = [
      ["p1", "p2", "p3", "p5"],
      ["p4", "p6", "p7", "p8"],
      ["p9", "p10", "p11", "p12"],
    ];
    const form = teamForm(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)], swapped));
    expect(form[0].wins).toBe(1);
    expect(form[1].losses).toBe(1);
  });

  test("is level for every team before a match is played", () => {
    expect(teamForm(session([]))).toEqual([
      { teamIndex: 0, wins: 0, losses: 0, netPoints: 0 },
      { teamIndex: 1, wins: 0, losses: 0, netPoints: 0 },
      { teamIndex: 2, wins: 0, losses: 0, netPoints: 0 },
    ]);
  });
});

describe("teamStandings", () => {
  test("nets a loss out of the margin, unlike teamStats", () => {
    const matches = [
      match("m1", TEAMS[0], TEAMS[1], 25, 19),
      match("m2", TEAMS[2], TEAMS[0], 25, 21),
    ];
    // teamStats only ever adds winning margins, so team 0 keeps its +6...
    expect(teamStats(session(matches))[0].pointDiff).toBe(6);
    // ...while the standings shown mid-session net the -4 back out.
    expect(teamStandings(session(matches))[0]).toEqual({
      teamIndex: 0,
      wins: 1,
      losses: 1,
      netPoints: 2,
    });
  });

  test("ignores the balancing rounds, unlike teamForm", () => {
    const matches = [
      match("m1", TEAMS[0], TEAMS[1], 25, 19),
      match("m2", TEAMS[0], TEAMS[2], 25, 21),
    ];
    expect(teamForm(session(matches, TEAMS, 1))[0].wins).toBe(2);
    expect(teamStandings(session(matches, TEAMS, 1))[0]).toEqual({
      teamIndex: 0,
      wins: 1,
      losses: 0,
      netPoints: 4,
    });
  });

  test("is level for every team before a counted match is played", () => {
    expect(teamStandings(session([]))).toEqual([
      { teamIndex: 0, wins: 0, losses: 0, netPoints: 0 },
      { teamIndex: 1, wins: 0, losses: 0, netPoints: 0 },
      { teamIndex: 2, wins: 0, losses: 0, netPoints: 0 },
    ]);
  });
});

describe("formBias", () => {
  test("is zero for a team that has not played", () => {
    expect(formBias({ teamIndex: 0, wins: 0, losses: 0, netPoints: 0 })).toBe(0);
  });

  test("lifts a winning record and drops a losing one, symmetrically", () => {
    const won = formBias({ teamIndex: 0, wins: 2, losses: 0, netPoints: 10 });
    const lost = formBias({ teamIndex: 1, wins: 0, losses: 2, netPoints: -10 });
    expect(won).toBeGreaterThan(0);
    expect(lost).toBe(-won);
  });

  test("weighs a net win above a handful of points", () => {
    const oneWinNarrow = formBias({ teamIndex: 0, wins: 1, losses: 0, netPoints: 2 });
    const noWinsBigMargins = formBias({ teamIndex: 1, wins: 1, losses: 1, netPoints: 15 });
    expect(oneWinNarrow).toBeGreaterThan(noWinsBigMargins);
  });
});

describe("lopsidedPairing", () => {
  test("finds nothing when everyone has traded wins", () => {
    expect(
      lopsidedPairing(
        session([
          match("m1", TEAMS[0], TEAMS[1], 25, 20),
          match("m2", TEAMS[1], TEAMS[2], 25, 20),
          match("m3", TEAMS[2], TEAMS[0], 25, 20),
        ]),
      ),
    ).toBeNull();
  });

  test("pairs the runaway leader with the team being run over", () => {
    // The night that started this: team 0 goes 2-0, team 1 goes 0-2.
    expect(
      lopsidedPairing(
        session([
          match("m1", TEAMS[0], TEAMS[1], 25, 23),
          match("m2", TEAMS[0], TEAMS[2], 25, 23),
          match("m3", TEAMS[2], TEAMS[1], 25, 23),
        ]),
      ),
    ).toEqual({ leader: 0, trailer: 1 });
  });

  test("stays quiet until the lead reaches the threshold", () => {
    expect(DOMINANCE_THRESHOLD).toBeGreaterThan(1);
    expect(lopsidedPairing(session([match("m1", TEAMS[0], TEAMS[1], 25, 20)]))).toBeNull();
  });

  test("needs a trailing team, not just a leading one", () => {
    // Team 0 is 2-0, but the two losses are spread across the other teams.
    expect(
      lopsidedPairing(
        session([
          match("m1", TEAMS[0], TEAMS[1], 25, 20),
          match("m2", TEAMS[0], TEAMS[2], 25, 20),
        ]),
      ),
    ).toBeNull();
  });
});
