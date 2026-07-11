import { describe, expect, test } from "vitest";
import { appReducer, initialState, isPlayerReferenced } from "./app-state";
import type { AppState, Match } from "./types";

const addPlayer = (state: AppState, id: string, skill = 5): AppState =>
  appReducer(state, { type: "add-player", id, name: `Player ${id}`, skill });

function stateWith12Players(): AppState {
  let state = initialState();
  for (let i = 1; i <= 12; i++) state = addPlayer(state, `p${i}`);
  return state;
}

const TEAMS: [string[], string[], string[]] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

function stateWithActiveSession(): AppState {
  return appReducer(stateWith12Players(), {
    type: "start-session",
    id: "s1",
    date: "2026-07-10",
    teams: TEAMS,
  });
}

const match: Match = {
  id: "m1",
  sideA: TEAMS[0],
  sideB: TEAMS[1],
  scoreA: 25,
  scoreB: 19,
  deltaA: 15,
  deltaB: -15,
  timestamp: "2026-07-10T10:00:00.000Z",
};

describe("add-player", () => {
  test("adds a player with elo seeded from skill", () => {
    const state = addPlayer(initialState(), "p1", 10);
    expect(state.players).toHaveLength(1);
    expect(state.players[0].elo).toBe(1600);
    expect(state.players[0].active).toBe(true);
  });
});

describe("update-player", () => {
  test("reseeds elo from new skill when player never played", () => {
    let state = addPlayer(initialState(), "p1", 5);
    state = appReducer(state, { type: "update-player", id: "p1", name: "New", skill: 10 });
    expect(state.players[0].name).toBe("New");
    expect(state.players[0].elo).toBe(1600);
  });

  test("keeps earned elo when player has session history", () => {
    let state = stateWithActiveSession();
    const before = state.players.find((p) => p.id === "p1")!.elo;
    state = appReducer(state, { type: "update-player", id: "p1", name: "New", skill: 10 });
    expect(state.players.find((p) => p.id === "p1")!.elo).toBe(before);
  });
});

describe("set-player-active", () => {
  test("toggles attendance without touching elo or history", () => {
    let state = addPlayer(initialState(), "p1", 7);
    const eloBefore = state.players[0].elo;
    state = appReducer(state, { type: "set-player-active", id: "p1", active: false });
    expect(state.players[0].active).toBe(false);
    expect(state.players[0].elo).toBe(eloBefore);
    state = appReducer(state, { type: "set-player-active", id: "p1", active: true });
    expect(state.players[0].active).toBe(true);
  });
});

describe("remove-player", () => {
  test("removes the player", () => {
    let state = addPlayer(initialState(), "p1");
    state = appReducer(state, { type: "remove-player", id: "p1" });
    expect(state.players).toHaveLength(0);
  });
});

describe("isPlayerReferenced", () => {
  test("false before any session, true once in a session", () => {
    expect(isPlayerReferenced(stateWith12Players(), "p1")).toBe(false);
    expect(isPlayerReferenced(stateWithActiveSession(), "p1")).toBe(true);
  });
});

describe("session lifecycle", () => {
  test("start-session appends an unfinished session", () => {
    const state = stateWithActiveSession();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].finished).toBe(false);
    expect(state.sessions[0].teams).toEqual(TEAMS);
  });

  test("end-session marks the active session finished", () => {
    const state = appReducer(stateWithActiveSession(), { type: "end-session" });
    expect(state.sessions[0].finished).toBe(true);
  });
});

describe("record-match", () => {
  test("appends the match and applies elo deltas to both sides", () => {
    const before = stateWithActiveSession();
    const eloOf = (s: AppState, id: string) => s.players.find((p) => p.id === id)!.elo;
    const state = appReducer(before, { type: "record-match", match });
    expect(state.sessions[0].matches).toHaveLength(1);
    expect(eloOf(state, "p1")).toBe(eloOf(before, "p1") + 15);
    expect(eloOf(state, "p5")).toBe(eloOf(before, "p5") - 15);
    expect(eloOf(state, "p9")).toBe(eloOf(before, "p9"));
  });

  test("is a no-op without an active session", () => {
    const state = stateWith12Players();
    expect(appReducer(state, { type: "record-match", match })).toEqual(state);
  });
});

describe("undo-last-match", () => {
  test("removes the match and reverts elo exactly", () => {
    const before = stateWithActiveSession();
    let state = appReducer(before, { type: "record-match", match });
    state = appReducer(state, { type: "undo-last-match" });
    expect(state).toEqual(before);
  });
});

describe("apply-swap", () => {
  test("swaps two players between teams of the active session", () => {
    const state = appReducer(stateWithActiveSession(), {
      type: "apply-swap",
      teamA: 0,
      playerA: "p1",
      teamB: 1,
      playerB: "p5",
    });
    expect(state.sessions[0].teams[0]).toContain("p5");
    expect(state.sessions[0].teams[0]).not.toContain("p1");
    expect(state.sessions[0].teams[1]).toContain("p1");
  });
});

describe("replace-state", () => {
  test("replaces the whole state (import)", () => {
    const incoming = stateWith12Players();
    const state = appReducer(initialState(), { type: "replace-state", state: incoming });
    expect(state).toEqual(incoming);
  });
});
