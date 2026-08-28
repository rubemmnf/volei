import { describe, expect, test } from "vitest";
import { computeEloDeltas, skillToElo } from "./elo";
import type { Player } from "../types";

function makeTeam(elos: number[]): Player[] {
  return elos.map((elo, i) => ({
    id: `p${elo}-${i}`,
    name: `P${i}`,
    skill: 5,
    baseElo: elo,
    elo,
    active: true,
  }));
}

describe("skillToElo", () => {
  test("maps skill 1 to 800", () => {
    expect(skillToElo(1)).toBe(800);
  });

  test("maps skill 5 to 1600", () => {
    expect(skillToElo(5)).toBe(1600);
  });

  test("maps skill 3 to 1200", () => {
    expect(skillToElo(3)).toBe(1200);
  });

  test("clamps out-of-range skill", () => {
    expect(skillToElo(0)).toBe(800);
    expect(skillToElo(6)).toBe(1600);
  });
});

describe("computeEloDeltas", () => {
  const even = makeTeam([1200, 1200, 1200, 1200]);

  test("deltas are zero-sum", () => {
    const { deltaA, deltaB } = computeEloDeltas(even, makeTeam([1300, 1200, 1100, 1200]), 25, 20);
    expect(deltaA + deltaB).toBe(0);
  });

  test("winner of an even match gains rating", () => {
    const { deltaA, deltaB } = computeEloDeltas(even, makeTeam([1200, 1200, 1200, 1200]), 25, 20);
    expect(deltaA).toBeGreaterThan(0);
    expect(deltaB).toBeLessThan(0);
  });

  test("bigger margin of victory produces a bigger swing", () => {
    const opponents = makeTeam([1200, 1200, 1200, 1200]);
    const narrow = computeEloDeltas(even, opponents, 25, 23);
    const blowout = computeEloDeltas(even, opponents, 25, 10);
    expect(blowout.deltaA).toBeGreaterThan(narrow.deltaA);
  });

  test("underdog win swings more than favorite win at same margin", () => {
    const strong = makeTeam([1400, 1400, 1400, 1400]);
    const weak = makeTeam([1000, 1000, 1000, 1000]);
    const upset = computeEloDeltas(weak, strong, 25, 20);
    const expected = computeEloDeltas(strong, weak, 25, 20);
    expect(upset.deltaA).toBeGreaterThan(expected.deltaA);
  });

  test("throws on tied scores", () => {
    expect(() => computeEloDeltas(even, even, 20, 20)).toThrow();
  });
});

describe("kFactor setting", () => {
  const teamA = makeTeam([1200, 1200, 1200, 1200]);
  const teamB = makeTeam([1200, 1200, 1200, 1200]);

  test("a bigger K moves ratings further for the same result", () => {
    const base = computeEloDeltas(teamA, teamB, 25, 20).deltaA;
    const doubled = computeEloDeltas(teamA, teamB, 25, 20, { kFactor: 64 }).deltaA;

    expect(doubled).toBeGreaterThan(base);
    // Not exactly 2x: each delta is rounded independently.
    expect(Math.abs(doubled - 2 * base)).toBeLessThanOrEqual(1);
  });

  test("stays zero-sum at any K", () => {
    const { deltaA, deltaB } = computeEloDeltas(teamA, teamB, 25, 20, { kFactor: 7 });
    expect(deltaA + deltaB).toBe(0);
  });
});

describe("seed range settings", () => {
  test("maps the ends of a custom scale onto a custom range", () => {
    const settings = { minElo: 1000, maxElo: 1200, maxSkill: 10 };
    expect(skillToElo(1, settings)).toBe(1000);
    expect(skillToElo(10, settings)).toBe(1200);
  });

  test("clamps a skill above the configured top of the scale", () => {
    expect(skillToElo(9, { minElo: 800, maxElo: 1600, maxSkill: 5 })).toBe(1600);
  });
});
