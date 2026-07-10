import { describe, expect, test } from "vitest";
import { AppStateSchema, MatchSchema, PlayerSchema, SessionSchema } from "./types";

const validPlayer = {
  id: "p1",
  name: "John",
  skill: 7,
  elo: 1200,
  active: true,
};

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const validMatch = {
  id: "m1",
  sideA: ids("a", 4),
  sideB: ids("b", 4),
  scoreA: 25,
  scoreB: 19,
  deltaA: 12,
  deltaB: -12,
  timestamp: "2026-07-10T10:00:00.000Z",
};

const validSession = {
  id: "s1",
  date: "2026-07-10",
  teams: [ids("a", 4), ids("b", 4), ids("c", 4)],
  matches: [validMatch],
  finished: false,
};

describe("PlayerSchema", () => {
  test("accepts a valid player", () => {
    expect(PlayerSchema.parse(validPlayer)).toEqual(validPlayer);
  });

  test("rejects skill below 1", () => {
    expect(PlayerSchema.safeParse({ ...validPlayer, skill: 0 }).success).toBe(false);
  });

  test("rejects skill above 10", () => {
    expect(PlayerSchema.safeParse({ ...validPlayer, skill: 11 }).success).toBe(false);
  });

  test("rejects empty name", () => {
    expect(PlayerSchema.safeParse({ ...validPlayer, name: "" }).success).toBe(false);
  });
});

describe("MatchSchema", () => {
  test("accepts a valid match", () => {
    expect(MatchSchema.parse(validMatch)).toEqual(validMatch);
  });

  test("rejects tied scores (volleyball has no ties)", () => {
    expect(MatchSchema.safeParse({ ...validMatch, scoreA: 20, scoreB: 20 }).success).toBe(false);
  });

  test("rejects negative scores", () => {
    expect(MatchSchema.safeParse({ ...validMatch, scoreA: -1 }).success).toBe(false);
  });

  test("rejects a side without exactly 4 players", () => {
    expect(MatchSchema.safeParse({ ...validMatch, sideA: ids("a", 3) }).success).toBe(false);
  });
});

describe("SessionSchema", () => {
  test("accepts a valid session", () => {
    expect(SessionSchema.parse(validSession)).toEqual(validSession);
  });

  test("rejects fewer than 3 teams", () => {
    const invalid = { ...validSession, teams: [ids("a", 4), ids("b", 4)] };
    expect(SessionSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects a team without exactly 4 players", () => {
    const invalid = { ...validSession, teams: [ids("a", 4), ids("b", 4), ids("c", 5)] };
    expect(SessionSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("AppStateSchema", () => {
  test("accepts a valid app state", () => {
    const state = { version: 1, players: [validPlayer], sessions: [validSession] };
    expect(AppStateSchema.parse(state)).toEqual(state);
  });

  test("rejects unknown version", () => {
    const state = { version: 2, players: [], sessions: [] };
    expect(AppStateSchema.safeParse(state).success).toBe(false);
  });
});
