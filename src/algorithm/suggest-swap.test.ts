import { describe, expect, test } from "vitest";
import { suggestSwap } from "./suggest-swap";
import { buildFamiliarityMatrix } from "./familiarity";
import type { Player } from "../types";

function makePlayer(id: string, elo: number): Player {
  return { id, name: id, skill: 5, elo, active: true };
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
