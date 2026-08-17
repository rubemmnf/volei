import { describe, expect, test } from "vitest";
import { appReducer, initialState, isPlayerReferenced, type AppAction } from "./app-state";
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
  timestamp: "2026-07-10T10:00:00.000Z",
};

const matchIn = (state: AppState, sessionId: string, matchId: string) =>
  state.sessions.find((s) => s.id === sessionId)!.matches.find((m) => m.id === matchId)!;

describe("add-player", () => {
  test("adds a player with baseElo seeded from skill", () => {
    const state = addPlayer(initialState(), "p1", 5);
    expect(state.players).toHaveLength(1);
    expect(state.players[0].baseElo).toBe(1600);
    expect(state.players[0].active).toBe(true);
  });
});

describe("update-player", () => {
  test("reseeds baseElo from new skill when player never played", () => {
    let state = addPlayer(initialState(), "p1", 5);
    state = appReducer(state, { type: "update-player", id: "p1", name: "New", skill: 5 });
    expect(state.players[0].name).toBe("New");
    expect(state.players[0].baseElo).toBe(1600);
  });

  test("keeps the frozen seed when player has session history", () => {
    let state = stateWithActiveSession();
    const before = state.players.find((p) => p.id === "p1")!.baseElo;
    state = appReducer(state, { type: "update-player", id: "p1", name: "New", skill: 1 });
    expect(state.players.find((p) => p.id === "p1")!.baseElo).toBe(before);
  });
});

describe("set-player-active", () => {
  test("toggles attendance without touching the seed or history", () => {
    let state = addPlayer(initialState(), "p1", 4);
    const seedBefore = state.players[0].baseElo;
    state = appReducer(state, { type: "set-player-active", id: "p1", active: false });
    expect(state.players[0].active).toBe(false);
    expect(state.players[0].baseElo).toBe(seedBefore);
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
  test("appends the match and leaves the roster alone", () => {
    const before = stateWithActiveSession();
    const state = appReducer(before, { type: "record-match", match });
    expect(state.sessions[0].matches).toHaveLength(1);
    expect(state.players).toEqual(before.players);
  });

  test("is a no-op without an active session", () => {
    const state = stateWith12Players();
    expect(appReducer(state, { type: "record-match", match })).toEqual(state);
  });
});

describe("undo-last-match", () => {
  test("removes the match, restoring the previous state exactly", () => {
    const before = stateWithActiveSession();
    let state = appReducer(before, { type: "record-match", match });
    state = appReducer(state, { type: "undo-last-match" });
    expect(state).toEqual(before);
  });

  test("is a no-op when the active session has no matches", () => {
    const state = stateWithActiveSession();
    expect(appReducer(state, { type: "undo-last-match" })).toEqual(state);
  });
});

describe("edit-match-score", () => {
  type EditAction = Extract<AppAction, { type: "edit-match-score" }>;
  const edit = (state: AppState, overrides: Partial<EditAction> = {}) =>
    appReducer(state, {
      type: "edit-match-score",
      sessionId: "s1",
      matchId: "m1",
      scoreA: 21,
      scoreB: 25,
      ...overrides,
    });

  test("corrects a score in the active session", () => {
    const state = edit(appReducer(stateWithActiveSession(), { type: "record-match", match }));
    expect(matchIn(state, "s1", "m1")).toMatchObject({ scoreA: 21, scoreB: 25 });
  });

  test("corrects a score in a finished session — the whole point", () => {
    let state = appReducer(stateWithActiveSession(), { type: "record-match", match });
    state = appReducer(state, { type: "end-session" });
    const edited = edit(state);
    expect(edited.sessions[0].finished).toBe(true);
    expect(matchIn(edited, "s1", "m1")).toMatchObject({ scoreA: 21, scoreB: 25 });
  });

  test("leaves the rest of the match untouched", () => {
    const state = edit(appReducer(stateWithActiveSession(), { type: "record-match", match }));
    const edited = matchIn(state, "s1", "m1");
    expect(edited.sideA).toEqual(match.sideA);
    expect(edited.sideB).toEqual(match.sideB);
    expect(edited.timestamp).toBe(match.timestamp);
  });

  test("rejects a tie", () => {
    const state = appReducer(stateWithActiveSession(), { type: "record-match", match });
    expect(edit(state, { scoreA: 20, scoreB: 20 })).toEqual(state);
  });

  test("is a no-op for an unknown session or match id", () => {
    const state = appReducer(stateWithActiveSession(), { type: "record-match", match });
    expect(edit(state, { sessionId: "nope" })).toEqual(state);
    expect(edit(state, { matchId: "nope" })).toEqual(state);
  });
});

describe("set-balancing-rounds", () => {
  test("starts a session with no balancing rounds", () => {
    expect(stateWithActiveSession().sessions[0].balancingRounds).toBe(0);
  });

  test("sets the count on the active session", () => {
    const state = appReducer(stateWithActiveSession(), { type: "set-balancing-rounds", count: 2 });
    expect(state.sessions[0].balancingRounds).toBe(2);
  });

  test("clamps a negative count to zero", () => {
    const state = appReducer(stateWithActiveSession(), { type: "set-balancing-rounds", count: -1 });
    expect(state.sessions[0].balancingRounds).toBe(0);
  });

  test("is a no-op without an active session", () => {
    const state = stateWith12Players();
    expect(appReducer(state, { type: "set-balancing-rounds", count: 2 })).toEqual(state);
  });

  test("leaves a finished session frozen", () => {
    let state = appReducer(stateWithActiveSession(), { type: "set-balancing-rounds", count: 1 });
    state = appReducer(state, { type: "end-session" });
    const after = appReducer(state, { type: "set-balancing-rounds", count: 3 });
    expect(after.sessions[0].balancingRounds).toBe(1);
  });

  test("undoing a match leaves the count alone", () => {
    let state = appReducer(stateWithActiveSession(), { type: "record-match", match });
    state = appReducer(state, { type: "set-balancing-rounds", count: 1 });
    state = appReducer(state, { type: "undo-last-match" });
    expect(state.sessions[0].balancingRounds).toBe(1);
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

  test("is a no-op when a player is not on the team it is swapped from", () => {
    const before = stateWithActiveSession();
    const after = appReducer(before, {
      type: "apply-swap",
      teamA: 0,
      playerA: "p9", // on team 2, not team 0
      teamB: 1,
      playerB: "p5",
    });
    expect(after).toEqual(before);
  });
});

describe("replace-state", () => {
  test("replaces the whole state (import)", () => {
    const incoming = stateWith12Players();
    const state = appReducer(initialState(), { type: "replace-state", state: incoming });
    expect(state).toEqual(incoming);
  });
});
