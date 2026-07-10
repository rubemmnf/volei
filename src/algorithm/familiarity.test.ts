import { describe, expect, test } from "vitest";
import { buildFamiliarityMatrix, pairFamiliarity, pairKey, teamFamiliarity } from "./familiarity";
import type { Session } from "../types";

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function makeSession(date: string, teams: [string[], string[], string[]]): Session {
  return { id: `s-${date}`, date, teams, matches: [], finished: true };
}

const TEAMS: [string[], string[], string[]] = [ids("a", 4), ids("b", 4), ids("c", 4)];

describe("pairKey", () => {
  test("is symmetric in argument order", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});

describe("buildFamiliarityMatrix", () => {
  test("session this week contributes weight 1 for teammates", () => {
    const matrix = buildFamiliarityMatrix([makeSession("2026-07-10", TEAMS)], new Date("2026-07-10"));
    expect(pairFamiliarity(matrix, "a1", "a2")).toBeCloseTo(1);
  });

  test("session 1 week ago contributes 0.75, 2 weeks ago 0.5625", () => {
    const matrix = buildFamiliarityMatrix(
      [makeSession("2026-07-03", TEAMS), makeSession("2026-06-26", TEAMS)],
      new Date("2026-07-10"),
    );
    expect(pairFamiliarity(matrix, "a1", "a2")).toBeCloseTo(0.75 + 0.5625);
  });

  test("players on different teams have zero familiarity", () => {
    const matrix = buildFamiliarityMatrix([makeSession("2026-07-10", TEAMS)], new Date("2026-07-10"));
    expect(pairFamiliarity(matrix, "a1", "b1")).toBe(0);
  });

  test("a pair counts once per session no matter how many matches were played", () => {
    const session = makeSession("2026-07-10", TEAMS);
    session.matches = [
      {
        id: "m1",
        sideA: ids("a", 4),
        sideB: ids("b", 4),
        scoreA: 25,
        scoreB: 20,
        deltaA: 5,
        deltaB: -5,
        timestamp: "2026-07-10T10:00:00.000Z",
      },
      {
        id: "m2",
        sideA: ids("a", 4),
        sideB: ids("c", 4),
        scoreA: 25,
        scoreB: 23,
        deltaA: 4,
        deltaB: -4,
        timestamp: "2026-07-10T10:30:00.000Z",
      },
    ];
    const matrix = buildFamiliarityMatrix([session], new Date("2026-07-10"));
    expect(pairFamiliarity(matrix, "a1", "a2")).toBeCloseTo(1);
  });

  test("pairs formed by a mid-session swap (visible in match sides) also count", () => {
    const session = makeSession("2026-07-10", TEAMS);
    // b1 ended up playing alongside a1 after a swap
    session.matches = [
      {
        id: "m1",
        sideA: ["a1", "a2", "a3", "b1"],
        sideB: ids("c", 4),
        scoreA: 25,
        scoreB: 20,
        deltaA: 5,
        deltaB: -5,
        timestamp: "2026-07-10T10:00:00.000Z",
      },
    ];
    const matrix = buildFamiliarityMatrix([session], new Date("2026-07-10"));
    expect(pairFamiliarity(matrix, "a1", "b1")).toBeCloseTo(1);
  });
});

describe("teamFamiliarity", () => {
  test("sums pairwise familiarity within a team", () => {
    const matrix = buildFamiliarityMatrix([makeSession("2026-07-10", TEAMS)], new Date("2026-07-10"));
    // all 6 pairs within a-team have weight 1
    expect(teamFamiliarity(ids("a", 4), matrix)).toBeCloseTo(6);
    // half old team, half new: only the a1-a2 pair is familiar
    expect(teamFamiliarity(["a1", "a2", "b1", "c1"], matrix)).toBeCloseTo(1);
  });
});
