import { describe, expect, test } from "vitest";
import { suggestBalancedSwaps } from "./suggest-balanced-swaps";
import type { Player } from "../types";

function makePlayer(id: string, elo: number): Player {
  return { id, name: id, skill: 3, elo, active: true };
}

function team(...elos: number[]): Player[] {
  return elos.map((elo, i) => makePlayer(`${elos.join("-")}#${i}`, elo));
}

describe("suggestBalancedSwaps", () => {
  test("ranks swaps between equal-Elo players first, leaving both totals untouched", () => {
    const teamX = team(1500, 1200, 1200, 1100);
    const teamY = team(1100, 1100, 1100, 1100);

    const swaps = suggestBalancedSwaps(teamX, teamY);

    expect(swaps[0].shift).toBe(0);
    expect(swaps[0].fromX.elo).toBe(1100);
    expect(swaps[0].fromY.elo).toBe(1100);
  });

  test("orders by ascending shift so later rows disturb the totals more", () => {
    const teamX = team(1300, 1200, 1200, 1200);
    const teamY = team(1250, 1100, 900, 800);

    const swaps = suggestBalancedSwaps(teamX, teamY);
    const shifts = swaps.map((s) => s.shift);

    expect(shifts).toEqual([...shifts].sort((a, b) => a - b));
  });

  test("breaks a shift tie in favour of the smaller gap after the swap", () => {
    const teamX = team(1200, 900, 800, 700); // sum 3600
    const teamY = team(1300, 1000, 600, 500); // sum 3400, gap 200

    const swaps = suggestBalancedSwaps(teamX, teamY);

    // Three pairs shift by 100; only 700 <-> 600 closes the 200 gap completely.
    expect(swaps[0]).toMatchObject({ shift: 100, gapAfter: 0 });
    expect(swaps[0].fromX.elo).toBe(700);
    expect(swaps[0].fromY.elo).toBe(600);
  });

  test("reports how far the gap moves for a lopsided pair", () => {
    const teamX = team(1500, 1200, 1200, 1100); // sum 5000
    const teamY = team(1100, 1100, 1100, 1100); // sum 4400, gap 600

    const swaps = suggestBalancedSwaps(teamX, teamY, 16);
    const biggest = swaps.find((s) => s.fromX.elo === 1500)!;

    expect(biggest.shift).toBe(400);
    expect(biggest.gapAfter).toBe(200);
  });

  test("returns at most the requested number of swaps", () => {
    const teamX = team(1200, 1200, 1200, 1200);
    const teamY = team(1100, 1100, 1100, 1100);

    expect(suggestBalancedSwaps(teamX, teamY)).toHaveLength(3);
    expect(suggestBalancedSwaps(teamX, teamY, 5)).toHaveLength(5);
  });

  test("throws unless both teams have 4 players", () => {
    const teamX = team(1200);
    const teamY = team(1200, 1200, 1200, 1200);

    expect(() => suggestBalancedSwaps(teamX, teamY)).toThrow();
  });
});
