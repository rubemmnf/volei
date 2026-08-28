import { describe, expect, test } from "vitest";
import type { AppState, Match, Session } from "../types";
import { deriveRatings } from "./derive-ratings";
import { computeEloDeltas, skillToElo } from "./elo";

const TEAMS: [string[], string[], string[]] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

function stateWith(matches: Match[], finished = true): AppState {
  const players = Array.from({ length: 12 }, (_, i) => {
    const skill = (i % 5) + 1;
    return { id: `p${i + 1}`, name: `Player ${i + 1}`, skill, baseElo: skillToElo(skill), active: true };
  });
  const session: Session = {
    id: "s1",
    date: "2026-07-10",
    teams: TEAMS,
    matches,
    finished,
    balancingRounds: 0,
    rebalanceMuted: false,
  };
  return { version: 2, players, sessions: [session] };
}

const match = (id: string, a: number, b: number, scoreA: number, scoreB: number): Match => ({
  id,
  sideA: TEAMS[a],
  sideB: TEAMS[b],
  scoreA,
  scoreB,
  timestamp: `2026-07-10T1${id.slice(1)}:00:00.000Z`,
});

const eloOf = (state: AppState, id: string) => deriveRatings(state).find((p) => p.id === id)!.elo;

describe("deriveRatings", () => {
  test("with no matches, every rating is the player's seed", () => {
    const state = stateWith([]);
    for (const rated of deriveRatings(state)) {
      expect(rated.elo).toBe(rated.baseElo);
    }
  });

  test("preserves roster order", () => {
    const state = stateWith([match("m1", 0, 1, 25, 19)]);
    expect(deriveRatings(state).map((p) => p.id)).toEqual(state.players.map((p) => p.id));
  });

  test("applies a single match's zero-sum delta to both sides", () => {
    const state = stateWith([match("m1", 0, 1, 25, 19)]);
    const sideA = state.players.slice(0, 4);
    const sideB = state.players.slice(4, 8);
    const { deltaA, deltaB } = computeEloDeltas(
      sideA.map((p) => ({ elo: p.baseElo })),
      sideB.map((p) => ({ elo: p.baseElo })),
      25,
      19,
    );

    expect(eloOf(state, "p1")).toBe(sideA[0].baseElo + deltaA);
    expect(eloOf(state, "p5")).toBe(sideB[0].baseElo + deltaB);
    expect(eloOf(state, "p9")).toBe(state.players[8].baseElo);
  });

  test("a mid-history correction changes ratings of players not even in that match", () => {
    const history = [match("m1", 0, 1, 25, 19), match("m2", 1, 2, 25, 23)];
    const before = deriveRatings(stateWith(history));

    // Flip only the FIRST match. Team 3 never played in it, but its m2 delta was
    // computed against a team-2 rating that the correction moves.
    const corrected = deriveRatings(
      stateWith([{ ...history[0], scoreA: 19, scoreB: 25 }, history[1]]),
    );

    const p9Before = before.find((p) => p.id === "p9")!.elo;
    const p9After = corrected.find((p) => p.id === "p9")!.elo;
    expect(p9After).not.toBe(p9Before);
  });

  test("is deterministic — same state in, same ratings out", () => {
    const state = stateWith([match("m1", 0, 1, 25, 19), match("m2", 1, 2, 25, 23)]);
    expect(deriveRatings(state)).toEqual(deriveRatings(state));
  });

  test("skips a match whose players are no longer in the roster", () => {
    const state = stateWith([match("m1", 0, 1, 25, 19)]);
    const pruned: AppState = { ...state, players: state.players.filter((p) => p.id !== "p5") };

    expect(() => deriveRatings(pruned)).not.toThrow();
    expect(eloOf(pruned, "p1")).toBe(pruned.players[0].baseElo);
  });

  test("replays across sessions in order", () => {
    const one = stateWith([match("m1", 0, 1, 25, 19)]);
    const two: AppState = {
      ...one,
      sessions: [
        one.sessions[0],
        { ...one.sessions[0], id: "s2", matches: [match("m2", 0, 1, 25, 21)] },
      ],
    };

    expect(eloOf(two, "p1")).toBeGreaterThan(eloOf(one, "p1"));
  });
});
