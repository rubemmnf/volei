// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { STORAGE_KEY, exportState, importState, loadState, migrate, saveState } from "./storage";
import { AppStateSchema, type AppState } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { computeEloDeltas, skillToElo } from "./algorithm/elo";
import { deriveRatings } from "./algorithm/derive-ratings";

const sampleState: AppState = {
  version: 2,
  settings: DEFAULT_SETTINGS,
  players: [{ id: "p1", name: "John", skill: 4, baseElo: 1200, active: true }],
  sessions: [],
};

beforeEach(() => {
  localStorage.clear();
});

describe("loadState", () => {
  test("returns empty status when nothing stored", () => {
    expect(loadState()).toEqual({ status: "empty" });
  });

  test("roundtrips a saved state", () => {
    saveState(sampleState);
    expect(loadState()).toEqual({ status: "ok", state: sampleState });
  });

  test("returns corrupt status for invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toEqual({ status: "corrupt" });
  });

  test("returns corrupt status for JSON failing schema", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadState()).toEqual({ status: "corrupt" });
  });
});

describe("export/import", () => {
  test("roundtrips through JSON text", () => {
    const text = exportState(sampleState);
    expect(importState(text)).toEqual(sampleState);
  });

  test("import throws on invalid JSON", () => {
    expect(() => importState("nope")).toThrow();
  });

  test("import throws on schema violation", () => {
    expect(() => importState(JSON.stringify({ version: 2, players: "x", sessions: [] }))).toThrow();
  });
});

describe("v1 -> v2 migration", () => {
  test("backs baseElo out of the running total using the stored deltas", () => {
    const migrated = migrate(v1Fixture()) as AppState;
    expect(migrated.version).toBe(2);
    for (const player of migrated.players) {
      expect(player.baseElo).toBe(skillToElo(player.skill));
      expect(player).not.toHaveProperty("elo");
    }
  });

  test("strips per-match deltas", () => {
    const migrated = migrate(v1Fixture()) as AppState;
    for (const match of migrated.sessions[0].matches) {
      expect(match).not.toHaveProperty("deltaA");
      expect(match).not.toHaveProperty("deltaB");
    }
  });

  test("replayed ratings equal the v1 running totals", () => {
    const v1 = v1Fixture();
    const migrated = AppStateSchema.parse(migrate(v1));
    const derived = deriveRatings(migrated);

    for (const old of v1.players) {
      expect(derived.find((p) => p.id === old.id)!.elo).toBe(old.elo);
    }
  });

  test("loads a v1 blob straight out of localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Fixture()));
    const result = loadState();
    expect(result.status).toBe("ok");
  });

  test("imports a v1 export", () => {
    expect(importState(JSON.stringify(v1Fixture())).version).toBe(2);
  });

  test("leaves an already-migrated v2 state untouched", () => {
    expect(migrate(sampleState)).toEqual(sampleState);
  });
});

/**
 * A v1 store built the way v1 actually built one: deltas computed from the live
 * running elo at record time and accumulated onto `Player.elo`. Fabricated deltas
 * would not survive a replay, so they are computed here rather than hardcoded.
 */
function v1Fixture() {
  const players = Array.from({ length: 12 }, (_, i) => {
    const skill = (i % 5) + 1;
    return { id: `p${i + 1}`, name: `Player ${i + 1}`, skill, elo: skillToElo(skill), active: true };
  });

  const teams = [
    players.slice(0, 4).map((p) => p.id),
    players.slice(4, 8).map((p) => p.id),
    players.slice(8, 12).map((p) => p.id),
  ];

  const scores: [number, number, number, number][] = [
    [0, 1, 25, 19],
    [1, 2, 25, 23],
    [0, 1, 18, 25],
  ];

  const matches = scores.map(([a, b, scoreA, scoreB], i) => {
    const sideA = teams[a];
    const sideB = teams[b];
    const resolve = (ids: string[]) => ids.map((id) => players.find((p) => p.id === id)!);
    const { deltaA, deltaB } = computeEloDeltas(resolve(sideA), resolve(sideB), scoreA, scoreB);
    for (const p of resolve(sideA)) p.elo += deltaA;
    for (const p of resolve(sideB)) p.elo += deltaB;
    return {
      id: `m${i + 1}`,
      sideA,
      sideB,
      scoreA,
      scoreB,
      deltaA,
      deltaB,
      timestamp: `2026-07-10T1${i}:00:00.000Z`,
    };
  });

  return {
    version: 1,
    players,
    sessions: [{ id: "s1", date: "2026-07-10", teams, matches, finished: true }],
  };
}

describe("settings persistence", () => {
  test("a state stored before settings existed loads with the defaults", () => {
    // Deliberately no `settings` key: this is what every v2 blob on disk looks like.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, players: sampleState.players, sessions: [] }),
    );
    const loaded = loadState();

    expect(loaded.status).toBe("ok");
    expect(loaded.status === "ok" && loaded.state.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("a backup without settings imports with the defaults", () => {
    const text = JSON.stringify({ version: 2, players: [], sessions: [] });
    expect(importState(text).settings).toEqual(DEFAULT_SETTINGS);
  });

  test("custom settings survive an export/import round trip", () => {
    const tuned: AppState = {
      ...sampleState,
      settings: { ...DEFAULT_SETTINGS, kFactor: 48, gameDay: 4, sessionPeriodDays: 14 },
    };
    expect(importState(exportState(tuned))).toEqual(tuned);
  });

  test("a backup carrying an out-of-range setting is rejected", () => {
    const text = JSON.stringify({
      version: 2,
      players: [],
      sessions: [],
      settings: { ...DEFAULT_SETTINGS, familiarityDecay: 42 },
    });
    expect(() => importState(text)).toThrow();
  });
});
