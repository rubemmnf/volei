import { describe, expect, test } from "vitest";
import type { Match, Session } from "../types";
import { sessionWinners, teamStats } from "./session-stats";

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
  return { id: "s1", date: "2026-07-10", teams, matches, finished: true, balancingRounds };
}

describe("teamStats", () => {
  test("credits the winning team with one win and the winning margin", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)]));

    expect(stats[0]).toEqual({ teamIndex: 0, wins: 1, pointDiff: 6 });
  });

  test("a loss adds neither a win nor a negative point difference", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)]));

    expect(stats[1]).toEqual({ teamIndex: 1, wins: 0, pointDiff: 0 });
  });

  test("credits the winner when the winning team is on side B", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[2], 18, 25)]));

    expect(stats[2]).toEqual({ teamIndex: 2, wins: 1, pointDiff: 7 });
    expect(stats[0]).toEqual({ teamIndex: 0, wins: 0, pointDiff: 0 });
  });

  test("accumulates wins and margins across matches", () => {
    const stats = teamStats(
      session([
        match("m1", TEAMS[0], TEAMS[1], 25, 19),
        match("m2", TEAMS[2], TEAMS[0], 20, 25),
        match("m3", TEAMS[1], TEAMS[2], 25, 23),
      ]),
    );

    expect(stats).toEqual([
      { teamIndex: 0, wins: 2, pointDiff: 11 },
      { teamIndex: 1, wins: 1, pointDiff: 2 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);
  });

  test("returns three zeroed rows for a session with no matches", () => {
    expect(teamStats(session([]))).toEqual([
      { teamIndex: 0, wins: 0, pointDiff: 0 },
      { teamIndex: 1, wins: 0, pointDiff: 0 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
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

    expect(stats[0]).toEqual({ teamIndex: 0, wins: 1, pointDiff: 4 });
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

    expect(stats).toEqual([
      { teamIndex: 0, wins: 0, pointDiff: 0 },
      { teamIndex: 1, wins: 1, pointDiff: 2 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);
  });

  test("zero balancing rounds counts every match", () => {
    const matches = [match("m1", TEAMS[0], TEAMS[1], 25, 19)];

    expect(teamStats(session(matches, TEAMS, 0))).toEqual(teamStats(session(matches)));
  });

  test("more balancing rounds than matches leaves nothing to count", () => {
    const stats = teamStats(session([match("m1", TEAMS[0], TEAMS[1], 25, 19)], TEAMS, 3));

    expect(stats).toEqual([
      { teamIndex: 0, wins: 0, pointDiff: 0 },
      { teamIndex: 1, wins: 0, pointDiff: 0 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);
    expect(sessionWinners(stats)).toEqual([]);
  });

  test("skips a match whose winning side has no majority overlap with any team", () => {
    const stats = teamStats(
      session([match("m1", ["p1", "p2", "p5", "p6"], ["p9", "p10", "p11", "p12"], 25, 21)]),
    );

    expect(stats).toEqual([
      { teamIndex: 0, wins: 0, pointDiff: 0 },
      { teamIndex: 1, wins: 0, pointDiff: 0 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);
  });
});

describe("sessionWinners", () => {
  test("returns the team with the most wins", () => {
    const winners = sessionWinners([
      { teamIndex: 0, wins: 2, pointDiff: 4 },
      { teamIndex: 1, wins: 1, pointDiff: 30 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);

    expect(winners).toEqual([0]);
  });

  test("breaks a tie on wins with the bigger point difference", () => {
    const winners = sessionWinners([
      { teamIndex: 0, wins: 2, pointDiff: 4 },
      { teamIndex: 1, wins: 2, pointDiff: 9 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);

    expect(winners).toEqual([1]);
  });

  test("returns every tied team when wins and point difference are equal", () => {
    const winners = sessionWinners([
      { teamIndex: 0, wins: 1, pointDiff: 5 },
      { teamIndex: 1, wins: 1, pointDiff: 5 },
      { teamIndex: 2, wins: 1, pointDiff: 2 },
    ]);

    expect(winners).toEqual([0, 1]);
  });

  test("returns no winner when no match was played", () => {
    const winners = sessionWinners([
      { teamIndex: 0, wins: 0, pointDiff: 0 },
      { teamIndex: 1, wins: 0, pointDiff: 0 },
      { teamIndex: 2, wins: 0, pointDiff: 0 },
    ]);

    expect(winners).toEqual([]);
  });
});
