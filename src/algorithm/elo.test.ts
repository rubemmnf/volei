import { describe, expect, test } from "vitest";
import { computeEloDeltas, skillToElo } from "./elo";
import type { Player } from "../types";

function makeTeam(elos: number[]): Player[] {
  return elos.map((elo, i) => ({ id: `p${elo}-${i}`, name: `P${i}`, skill: 5, elo, active: true }));
}

describe("skillToElo", () => {
  test("maps skill 1 to 800", () => {
    expect(skillToElo(1)).toBe(800);
  });

  test("maps skill 10 to 1600", () => {
    expect(skillToElo(10)).toBe(1600);
  });

  test("maps skill 5.5 to 1200", () => {
    expect(skillToElo(5.5)).toBe(1200);
  });

  test("clamps out-of-range skill", () => {
    expect(skillToElo(0)).toBe(800);
    expect(skillToElo(15)).toBe(1600);
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
