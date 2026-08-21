import { describe, expect, test } from "vitest";
import { rankSwaps } from "./suggest-swap";
import { buildFamiliarityMatrix } from "./familiarity";
import { formBias } from "./session-stats";
import type { Player } from "../types";

function makePlayer(id: string, elo: number): Player {
  return { id, name: id, skill: 5, baseElo: elo, elo, active: true };
}

const EMPTY_MATRIX = buildFamiliarityMatrix([], new Date("2026-07-10"));

describe("rankSwaps", () => {
  // Gap 600. Swapping a 1500 for a 1100 closes it to 200; a 1200 for a 1100 to 400;
  // a 1100 for a 1100 leaves it at 600 and must rank last.
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
  const balanced = (prefix: string) => [
    makePlayer(`${prefix}1`, 1200),
    makePlayer(`${prefix}2`, 1200),
    makePlayer(`${prefix}3`, 1200),
    makePlayer(`${prefix}4`, 1200),
  ];

  test("returns the best swaps first, closest gap first", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX);
    expect(swaps).toHaveLength(3);
    expect(swaps[0].gapAfter).toBe(200);
    expect(swaps.map((s) => s.gapAfter)).toEqual(
      [...swaps.map((s) => s.gapAfter)].sort((a, b) => a - b),
    );
  });

  test("offers alternatives beyond the single best swap", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX);
    const pairs = swaps.map((s) => `${s.fromX.id}/${s.fromY.id}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test("honours the limit", () => {
    expect(rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX, { limit: 1 })).toHaveLength(1);
  });

  test("flags whether a swap actually improves on the current gap", () => {
    const swaps = rankSwaps(lopsidedX(), flatY(), EMPTY_MATRIX, { limit: 99 });
    expect(swaps.every((s) => s.improves === s.gapAfter < 600)).toBe(true);
    expect(swaps.some((s) => s.improves)).toBe(true);
  });

  test("still offers the least uneven swaps when none improve", () => {
    const swaps = rankSwaps(balanced("x"), balanced("y"), EMPTY_MATRIX);
    expect(swaps).toHaveLength(3);
    expect(swaps.every((s) => s.improves)).toBe(false);
  });

  test("throws unless both teams have 4 players", () => {
    expect(() => rankSwaps([makePlayer("x1", 1200)], flatY(), EMPTY_MATRIX)).toThrow();
  });
});

describe("rankSwaps with tonight's form", () => {
  // The night that prompted all this. The 2-0 team is the rated-weaker one: winning
  // twice pulled its sum up to within 64 of the 0-2 team, so on ratings alone every
  // 1-for-1 swap overshoots and nothing is offered.
  const winners = () => [
    makePlayer("w1", 1244),
    makePlayer("w2", 1244),
    makePlayer("w3", 844),
    makePlayer("w4", 844),
  ];
  const losers = () => [
    makePlayer("l1", 1560),
    makePlayer("l2", 960),
    makePlayer("l3", 960),
    makePlayer("l4", 760),
  ];
  const winnerBias = formBias({ teamIndex: 0, wins: 2, losses: 0, netPoints: 4 });
  const loserBias = formBias({ teamIndex: 1, wins: 0, losses: 2, netPoints: -4 });

  test("offers nothing worth doing on ratings alone", () => {
    const swaps = rankSwaps(winners(), losers(), EMPTY_MATRIX, { limit: 99 });
    expect(swaps.some((s) => s.improves)).toBe(false);
  });

  test("finds a real swap once the 2-0 and 0-2 records are weighed in", () => {
    const swaps = rankSwaps(winners(), losers(), EMPTY_MATRIX, {
      biasX: winnerBias,
      biasY: loserBias,
    });
    expect(swaps[0].improves).toBe(true);
  });

  test("sends rating from the team that keeps winning to the team that keeps losing", () => {
    const [best] = rankSwaps(winners(), losers(), EMPTY_MATRIX, {
      biasX: winnerBias,
      biasY: loserBias,
    });
    expect(best.fromX.elo).toBeGreaterThan(best.fromY.elo);
  });

  test("leaves the ranking alone when both teams have the same record", () => {
    const evenly = rankSwaps(winners(), losers(), EMPTY_MATRIX, { biasX: 150, biasY: 150 });
    const unbiased = rankSwaps(winners(), losers(), EMPTY_MATRIX);
    expect(evenly.map((s) => s.fromX.id)).toEqual(unbiased.map((s) => s.fromX.id));
  });
});
