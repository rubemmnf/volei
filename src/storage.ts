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

/**
 * v1 stored a running `Player.elo` plus a `deltaA`/`deltaB` on every match.
 * v2 derives ratings by replaying matches on top of `baseElo`, so the seed is
 * recovered by subtracting the deltas the player accumulated — the exact inverse
 * of how v1 built the running total, which keeps ratings identical across the
 * upgrade. Exported v1 backups go through the same path on import.
 */
export function migrate(raw: unknown): unknown {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
