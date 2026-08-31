import { describe, expect, test } from "vitest";
import type { AppAction } from "../app-state";
import { DEFAULT_SETTINGS } from "../settings";
import { AppStateSchema } from "../types";
import { AppActionSchema, parseAction, parseServerMessage } from "./protocol";

const TEAMS: [string[], string[], string[]] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

const sampleState = AppStateSchema.parse({ version: 3, players: [], sessions: [] });

/**
 * Every variant of the union. If an action is added to `AppAction` without a
 * schema arm, `parseAction`'s return type stops compiling; this list is what
 * catches the opposite mistake, a schema arm that rejects a legal action.
 */
const ALL_ACTIONS: AppAction[] = [
  { type: "add-player", id: "p1", name: "Ana", skill: 3 },
  { type: "update-player", id: "p1", name: "Ana", skill: 4 },
  { type: "set-player-active", id: "p1", active: false },
  { type: "remove-player", id: "p1" },
  { type: "start-session", id: "s1", date: "2026-07-10", teams: TEAMS },
  { type: "end-session" },
  {
    type: "record-match",
    match: {
      id: "m1",
      sideA: TEAMS[0],
      sideB: TEAMS[1],
      scoreA: 25,
      scoreB: 19,
      timestamp: "2026-07-10T10:00:00.000Z",
    },
  },
  { type: "undo-last-match" },
  { type: "undo-last-match", matchId: "m1" },
  { type: "set-balancing-rounds", count: 2 },
  { type: "edit-match-score", sessionId: "s1", matchId: "m1", scoreA: 25, scoreB: 20 },
  { type: "apply-swap", teamA: 0, playerA: "p1", teamB: 1, playerB: "p5" },
  { type: "mute-rebalance" },
  { type: "update-settings", settings: DEFAULT_SETTINGS },
  { type: "replace-state", state: sampleState },
];

describe("AppActionSchema", () => {
  test.each(ALL_ACTIONS.map((action) => [action.type, action] as const))(
    "round-trips %s through JSON",
    (_type, action) => {
      expect(parseAction(JSON.parse(JSON.stringify(action)))).toEqual(action);
    },
  );

  test("rejects an unknown action type", () => {
    expect(() => parseAction({ type: "drop-database" })).toThrow();
  });

  test("rejects a known action with a missing field", () => {
    expect(() => parseAction({ type: "add-player", id: "p1" })).toThrow();
  });

  test("rejects a team that is not four players", () => {
    expect(() =>
      parseAction({
        type: "start-session",
        id: "s1",
        date: "2026-07-10",
        teams: [["p1"], TEAMS[1], TEAMS[2]],
      }),
    ).toThrow();
  });

  test("rejects a tied match, the same as local entry does", () => {
    expect(() =>
      parseAction({
        type: "record-match",
        match: {
          id: "m1",
          sideA: TEAMS[0],
          sideB: TEAMS[1],
          scoreA: 25,
          scoreB: 25,
          timestamp: "2026-07-10T10:00:00.000Z",
        },
      }),
    ).toThrow();
  });

  test("rejects a replace-state carrying a corrupt state", () => {
    expect(() => parseAction({ type: "replace-state", state: { version: 99 } })).toThrow();
  });

  test("covers every arm of the union", () => {
    const covered = new Set(ALL_ACTIONS.map((a) => a.type));
    expect(covered.size).toBe(AppActionSchema.options.length);
  });
});

describe("parseServerMessage", () => {
  test("parses a sync batch", () => {
    const message = parseServerMessage(
      JSON.stringify({
        type: "sync",
        reset: true,
        entries: [{ seq: 0, localId: "a", action: { type: "end-session" } }],
      }),
    );
    expect(message.type).toBe("sync");
  });

  test("rejects a message whose entry carries a bad action", () => {
    expect(() =>
      parseServerMessage(
        JSON.stringify({
          type: "sync",
          reset: false,
          entries: [{ seq: 0, localId: "a", action: { type: "nope" } }],
        }),
      ),
    ).toThrow();
  });

  test("rejects non-JSON", () => {
    expect(() => parseServerMessage("not json")).toThrow();
  });
});
