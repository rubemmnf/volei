import { describe, expect, test } from "vitest";
import { rankSwaps, suggestSwap } from "./suggest-swap";
import { buildFamiliarityMatrix } from "./familiarity";
import type { Player } from "../types";

function makePlayer(id: string, elo: number): Player {
  return { id, name: id, skill: 5, baseElo: elo, elo, active: true };
}

const EMPTY_MATRIX = buildFamiliarityMatrix([], new Date("2026-07-10"));

describe("suggestSwap", () => {
  test("finds the swap that most evens out lopsided teams", () => {
    const teamX = [makePlayer("x1", 1500), makePlayer("x2", 1200), makePlayer("x3", 1200), makePlayer("x4", 1100)];
    const teamY = [makePlayer("y1", 1100), makePlayer("y2", 1100), makePlayer("y3", 1100), makePlayer("y4", 1100)];
    const swap = suggestSwap(teamX, teamY, EMPTY_MATRIX);
    expect(swap).not.toBeNull();
    expect(swap!.fromX.elo).toBe(1500);
    expect(swap!.fromY.elo).toBe(1100);
  });

  test("returns null when teams are already balanced", () => {
    const teamX = [makePlayer("x1", 1200), makePlayer("x2", 1200), makePlayer("x3", 1200), makePlayer("x4", 1200)];
    const teamY = [makePlayer("y1", 1200), makePlayer("y2", 1200), makePlayer("y3", 1200), makePlayer("y4", 1200)];
    expect(suggestSwap(teamX, teamY, EMPTY_MATRIX)).toBeNull();
  });

  test("throws unless both teams have 4 players", () => {
    const teamX = [makePlayer("x1", 1200)];
    const teamY = [makePlayer("y1", 1200), makePlayer("y2", 1200), makePlayer("y3", 1200), makePlayer("y4", 1200)];
    expect(() => suggestSwap(teamX, teamY, EMPTY_MATRIX)).toThrow();
  });
});

describe("rankSwaps", () => {
  // Gap 600. Swapping a 1500 for a 1100 closes it to 200; a 1200 for a 1100 to 400;
  // a 1100 for a 1100 leaves it at 600 and must not be offered.
  const lopsidedX = () => [
    makePlayer("x1", 1500),
    makePlayer("x2", 1200),
    makePlayer("x3", 1200),
    makePlayer("x4", 1100),
  ];
  const flatY = () => [
    makePlayer("y1", 1100),
    makePlayer("y2", 1100),
    makePlayer("y3", 1100),
    makePlayer("y4", 1100),
  ];

  test("returns the best swaps first, closest gap first", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX);
    expect(swaps).toHaveLength(3);
    expect(swaps[0].gapAfter).toBe(200);
    expect(swaps.map((s) => s.gapAfter)).toEqual([...swaps.map((s) => s.gapAfter)].sort((a, b) => a - b));
  });

  test("offers alternatives beyond the single best swap", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX);
    const pairs = swaps.map((s) => `${s.fromX.id}/${s.fromY.id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test("honours the limit", () => {
    expect(rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX, 1)).toHaveLength(1);
  });

  test("omits swaps that do not improve on the current gap", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX, 99);
    expect(swaps.every((s) => s.gapAfter < 600)).toBe(true);
  });

  test("returns nothing when teams are already balanced", () => {
    const teamX = [makePlayer("x1", 1200), makePlayer("x2", 1200), makePlayer("x3", 1200), makePlayer("x4", 1200)];
    const teamY = [makePlayer("y1", 1200), makePlayer("y2", 1200), makePlayer("y3", 1200), makePlayer("y4", 1200)];
    expect(rankSwaps(teamX, teamY, EMPTY_MATRIX)).toEqual([]);
  });

  test("agrees with suggestSwap on the top pick", () => {
    const best = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX)[0];
    const suggested = suggestSwap(lopsidedX(), flatY(), EMPTY_MATRIX);
    expect(suggested!.fromX.id).toBe(best.fromX.id);
    expect(suggested!.fromY.id).toBe(best.fromY.id);
  });

  test("throws unless both teams have 4 players", () => {
    expect(() => rankSwaps([makePlayer("x1", 1200)], flatY(), EMPTY_MATRIX)).toThrow();
  });
});
