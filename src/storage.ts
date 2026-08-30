import { AppStateSchema, type AppState } from "./types";

export const STORAGE_KEY = "volei-state-v1";

export type LoadResult =
  | { status: "ok"; state: AppState }
  | { status: "empty" }
  | { status: "corrupt" };

export function loadState(): LoadResult {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { status: "empty" };
  try {
    return { status: "ok", state: parseState(raw) };
  } catch {
    return { status: "corrupt" };
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): AppState {
  return parseState(json);
}

function parseState(json: string): AppState {
  return AppStateSchema.parse(migrate(JSON.parse(json)));
}

/** The seed range v2 was written against, and the one v3 rescales onto. */
const V2_SEED_RANGE = { min: 800, max: 1600 };
const V3_SEED_RANGE = { min: 1000, max: 2000 };

/**
 * Runs a stored state forward to the current version, one step at a time, so a
 * v1 backup imported today goes through every migration in order.
 */
export function migrate(raw: unknown): unknown {
  return migrateV2toV3(migrateV1toV2(raw));
}

/**
 * v1 stored a running `Player.elo` plus a `deltaA`/`deltaB` on every match.
 * v2 derives ratings by replaying matches on top of `baseElo`, so the seed is
 * recovered by subtracting the deltas the player accumulated — the exact inverse
 * of how v1 built the running total, which keeps ratings identical across the
 * upgrade. Exported v1 backups go through the same path on import.
 */
function migrateV1toV2(raw: unknown): unknown {
  if (!isRecord(raw) || raw.version !== 1) return raw;
  if (!Array.isArray(raw.players) || !Array.isArray(raw.sessions)) return raw;

  const accrued = new Map<string, number>();
  const addDelta = (ids: unknown, delta: unknown) => {
    if (!Array.isArray(ids) || typeof delta !== "number") return;
    for (const id of ids) {
      if (typeof id === "string") accrued.set(id, (accrued.get(id) ?? 0) + delta);
    }
  };

  const sessions = raw.sessions.map((session) => {
    if (!isRecord(session) || !Array.isArray(session.matches)) return session;
    const matches = session.matches.map((match) => {
      if (!isRecord(match)) return match;
      addDelta(match.sideA, match.deltaA);
      addDelta(match.sideB, match.deltaB);
      const { deltaA: _a, deltaB: _b, ...rest } = match;
      return rest;
    });
    return { ...session, matches };
  });

  const players = raw.players.map((player) => {
    if (!isRecord(player)) return player;
    const { elo, ...rest } = player;
    const baseElo = typeof elo === "number" ? elo - (accrued.get(String(rest.id)) ?? 0) : elo;
    return { ...rest, baseElo };
  });

  return { ...raw, version: 2, players, sessions };
}

/**
 * v3 widens the skill seed range from 800-1600 to 1000-2000, purely so a rating
 * reads at a glance. Every stored `baseElo` is remapped linearly onto the new
 * range, which keeps players in the same order and the same relative spacing —
 * only the numbers printed change.
 *
 * A state whose seed range was customised is left alone: remapping it would
 * silently discard a deliberate choice. Its version still moves to 3, since
 * nothing else about the shape differs.
 */
function migrateV2toV3(raw: unknown): unknown {
  if (!isRecord(raw) || raw.version !== 2) return raw;
  if (!Array.isArray(raw.players)) return raw;

  const settings = isRecord(raw.settings) ? raw.settings : {};
  const min = typeof settings.minElo === "number" ? settings.minElo : V2_SEED_RANGE.min;
  const max = typeof settings.maxElo === "number" ? settings.maxElo : V2_SEED_RANGE.max;
  if (min !== V2_SEED_RANGE.min || max !== V2_SEED_RANGE.max) {
    return { ...raw, version: 3 };
  }

  const span = V2_SEED_RANGE.max - V2_SEED_RANGE.min;
  const newSpan = V3_SEED_RANGE.max - V3_SEED_RANGE.min;
  const rescale = (elo: number) =>
    Math.round(V3_SEED_RANGE.min + ((elo - V2_SEED_RANGE.min) / span) * newSpan);

  const players = raw.players.map((player) => {
    if (!isRecord(player) || typeof player.baseElo !== "number") return player;
    return { ...player, baseElo: rescale(player.baseElo) };
  });

  return {
    ...raw,
    version: 3,
    players,
    settings: { ...settings, minElo: V3_SEED_RANGE.min, maxElo: V3_SEED_RANGE.max },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
