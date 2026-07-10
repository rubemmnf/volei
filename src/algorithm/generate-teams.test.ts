import { describe, expect, test } from "vitest";
import { generateTeams } from "./generate-teams";
import { buildFamiliarityMatrix, pairKey, type FamiliarityMatrix } from "./familiarity";
import type { Player, Session } from "../types";

function makePlayer(id: string, elo: number): Player {
  return { id, name: id, skill: 5, elo, active: true };
}

const EMPTY_MATRIX = buildFamiliarityMatrix([], new Date("2026-07-10"));

describe("generateTeams", () => {
  test("throws unless exactly 12 players", () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`p${i}`, 1200));
    expect(() => generateTeams(players, EMPTY_MATRIX)).toThrow();
  });

  test("returns 3 disjoint teams of 4", () => {
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 1000 + i * 50));
    const teams = generateTeams(players, EMPTY_MATRIX);
    expect(teams).toHaveLength(3);
    const all = new Set(teams.flat().map((p) => p.id));
    expect(all.size).toBe(12);
    for (const team of teams) expect(team).toHaveLength(4);
  });

  test("spreads 3 strong players one per team when perfect balance is possible", () => {
    const strong = ["s1", "s2", "s3"].map((id) => makePlayer(id, 1600));
    const weak = Array.from({ length: 9 }, (_, i) => makePlayer(`w${i}`, 1000));
    const teams = generateTeams([...strong, ...weak], EMPTY_MATRIX);
    for (const team of teams) {
      const strongCount = team.filter((p) => p.elo === 1600).length;
      expect(strongCount).toBe(1);
    }
  });

  test("separates a heavily familiar pair when balance allows", () => {
    // all equal elo -> every partition is perfectly balanced; familiarity is the only signal
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 1200));
    const matrix: FamiliarityMatrix = { [pairKey("p0", "p1")]: 5 };
    const teams = generateTeams(players, matrix);
    // p0-p1 is the only familiar pair; some zero-cost partition separates them
    const teamOfP0 = teams.find((t) => t.some((p) => p.id === "p0"))!;
    expect(teamOfP0.some((p) => p.id === "p1")).toBe(false);
  });

  test("minimizes carried-over pairs from a full previous week", () => {
    // Previous grouping of 3 full teams: pigeonhole forces >=1 old pair per new
    // team, so the best achievable is exactly 3 carried-over pairs.
    const players = Array.from({ length: 12 }, (_, i) => makePlayer(`p${i}`, 1200));
    const together: [string[], string[], string[]] = [
      ["p0", "p1", "p2", "p3"],
      ["p4", "p5", "p6", "p7"],
      ["p8", "p9", "p10", "p11"],
    ];
    const history: Session[] = [
      { id: "s1", date: "2026-07-03", teams: together, matches: [], finished: true },
    ];
    const matrix = buildFamiliarityMatrix(history, new Date("2026-07-10"));
    const teams = generateTeams(players, matrix);

    const oldTeamOf = (id: string) => together.findIndex((t) => t.includes(id));
    let carriedPairs = 0;
    for (const team of teams) {
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          if (oldTeamOf(team[i].id) === oldTeamOf(team[j].id)) carriedPairs++;
        }
      }
    }
    expect(carriedPairs).toBe(3);
  });
});
