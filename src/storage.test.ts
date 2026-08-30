// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { STORAGE_KEY, exportState, importState, loadState, migrate, saveState } from "./storage";
import { AppStateSchema, type AppState } from "./types";
import { DEFAULT_SETTINGS } from "./settings";
import { computeEloDeltas, skillToElo } from "./algorithm/elo";
import { deriveRatings } from "./algorithm/derive-ratings";

const sampleState: AppState = {
  version: 3,
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
    expect(() => importState(JSON.stringify({ version: 3, players: "x", sessions: [] }))).toThrow();
  });
});

describe("v1 -> v2 migration", () => {
  test("backs baseElo out of the running total using the stored deltas", () => {
    const migrated = migrate(v1Fixture()) as AppState;
    expect(migrated.version).toBe(3);
    for (const player of migrated.players) {
      // Two steps land exactly on today's seed: v2 recovers the old-range seed by
      // undoing the deltas, v3 maps that range onto the current one.
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

  test("replay preserves the order the v1 running totals put players in", () => {
    // Not equality any more: v3 stretches every seed gap by 1.25, so replaying the
    // same scores over the wider range yields different deltas. What has to survive
    // is who ended up above whom.
    const v1 = v1Fixture();
    const migrated = AppStateSchema.parse(migrate(v1));
    const derived = deriveRatings(migrated);

    const byId = new Map(derived.map((p) => [p.id, p.elo]));
    const oldOrder = [...v1.players].sort((a, b) => a.elo - b.elo || a.id.localeCompare(b.id));
    const newOrder = [...v1.players].sort(
      (a, b) => byId.get(a.id)! - byId.get(b.id)! || a.id.localeCompare(b.id),
    );

    expect(newOrder.map((p) => p.id)).toEqual(oldOrder.map((p) => p.id));
  });

  test("loads a v1 blob straight out of localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Fixture()));
    const result = loadState();
    expect(result.status).toBe("ok");
  });

  test("imports a v1 export", () => {
    expect(importState(JSON.stringify(v1Fixture())).version).toBe(3);
  });

  test("leaves an already-migrated current state untouched", () => {
    expect(migrate(sampleState)).toEqual(sampleState);
  });
});

/**
 * A v1 store built the way v1 actually built one: deltas computed from the live
 * running elo at record time and accumulated onto `Player.elo`. Fabricated deltas
 * would not survive a replay, so they are computed here rather than hardcoded.
 */
/** The seed range in force when v1 blobs were written. */
const V1_SEEDS = { minElo: 800, maxElo: 1600, maxSkill: 5 };

function v1Fixture() {
  const players = Array.from({ length: 12 }, (_, i) => {
    const skill = (i % 5) + 1;
    const elo = skillToElo(skill, V1_SEEDS);
    return { id: `p${i + 1}`, name: `Player ${i + 1}`, skill, elo, active: true };
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
      version: 3,
      players: [],
      sessions: [],
      settings: { ...DEFAULT_SETTINGS, familiarityDecay: 42 },
    });
    expect(() => importState(text)).toThrow();
  });
});

describe("v2 -> v3 seed range", () => {
  const v2 = (players: unknown[], settings?: Record<string, unknown>) => ({
    version: 2,
    players,
    sessions: [],
    ...(settings ? { settings } : {}),
  });

  const player = (id: string, baseElo: number) => ({
    id,
    name: id,
    skill: 3,
    baseElo,
    active: true,
  });

  test("remaps the ends of the old range onto the ends of the new one", () => {
    const migrated = migrate(v2([player("lo", 800), player("hi", 1600)])) as AppState;
    expect(migrated.players.map((p) => p.baseElo)).toEqual([1000, 2000]);
  });

  test("keeps the midpoint at the midpoint", () => {
    const migrated = migrate(v2([player("mid", 1200)])) as AppState;
    expect(migrated.players[0].baseElo).toBe(1500);
  });

  test("preserves the order and relative spacing of the roster", () => {
    const before = [900, 1000, 1400];
    const migrated = migrate(v2(before.map((e, i) => player(`p${i}`, e)))) as AppState;
    const after = migrated.players.map((p) => p.baseElo);

    expect(after).toEqual([...after].sort((a, b) => a - b));
    // Every gap stretches by the same factor, so nobody overtakes anybody.
    const ratio = (after[1] - after[0]) / (before[1] - before[0]);
    expect((after[2] - after[1]) / (before[2] - before[1])).toBeCloseTo(ratio);
  });

  test("moves the stored seed range across with the players", () => {
    const migrated = migrate(v2([player("p1", 1200)])) as AppState;
    expect(migrated.settings.minElo).toBe(1000);
    expect(migrated.settings.maxElo).toBe(2000);
  });

  test("leaves a customised seed range and its players alone", () => {
    const custom = { ...DEFAULT_SETTINGS, minElo: 500, maxElo: 3000 };
    const migrated = migrate(v2([player("p1", 1200)], custom)) as AppState;

    expect(migrated.players[0].baseElo).toBe(1200);
    expect(migrated.settings.minElo).toBe(500);
    expect(migrated.settings.maxElo).toBe(3000);
  });

  test("a v1 backup runs through both migrations and parses", () => {
    const migrated = AppStateSchema.parse(migrate(v1Fixture()));
    expect(migrated.version).toBe(3);
    expect(migrated.settings.minElo).toBe(1000);
  });

  test("a new player seeds on the new range", () => {
    expect(skillToElo(1)).toBe(1000);
    expect(skillToElo(5)).toBe(2000);
  });
});
