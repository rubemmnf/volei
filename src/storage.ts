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
    return { status: "ok", state: AppStateSchema.parse(JSON.parse(raw)) };
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
  return AppStateSchema.parse(JSON.parse(json));
}
