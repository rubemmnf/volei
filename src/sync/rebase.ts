import { appReducer, initialState, type AppAction } from "../app-state";
import type { AppState } from "../types";
import type { LogEntry } from "./protocol";

/** A locally dispatched action the server has not acknowledged yet. */
export type PendingAction = { localId: string; action: AppAction };

/**
 * Everything the client needs to render optimistically while staying convergent.
 *
 * `confirmed` is the reducer folded over server-ordered entries only, so it is
 * identical on every device that has seen the same `lastSeq`. `pending` is what
 * this device has done but not yet had echoed back. The rendered state is
 * `pending` replayed on top of `confirmed`, which is why a tap feels instant
 * while the ordering stays the server's to decide.
 */
export type Engine = {
  confirmed: AppState;
  /** Highest server seq folded into `confirmed`; -1 before the first entry. */
  lastSeq: number;
  pending: PendingAction[];
};

export function emptyEngine(): Engine {
  return { confirmed: initialState(), lastSeq: -1, pending: [] };
}

export function engineFrom(state: AppState, lastSeq: number, pending: PendingAction[] = []): Engine {
  return { confirmed: state, lastSeq, pending };
}

/** What the UI actually renders: confirmed history plus our own unacked work. */
export function renderState(engine: Engine): AppState {
  return engine.pending.reduce((state, p) => appReducer(state, p.action), engine.confirmed);
}

export function applyLocal(engine: Engine, pending: PendingAction): Engine {
  return { ...engine, pending: [...engine.pending, pending] };
}

/**
 * Fold one server entry into `confirmed`.
 *
 * Dropping the matching `localId` from `pending` is what stops our own action
 * being applied twice: it was already optimistically in the rendered state, and
 * now it is in `confirmed` instead.
 */
export function applyEntry(engine: Engine, entry: LogEntry): Engine {
  if (entry.seq <= engine.lastSeq) return engine;
  return {
    confirmed: appReducer(engine.confirmed, entry.action),
    lastSeq: entry.seq,
    pending: engine.pending.filter((p) => p.localId !== entry.localId),
  };
}

/**
 * Apply a catch-up batch. `reset` means the server compacted past what we have,
 * so the entries replace our confirmed history rather than extending it.
 */
export function applySync(engine: Engine, reset: boolean, entries: LogEntry[]): Engine {
  const base = reset ? { ...emptyEngine(), pending: engine.pending } : engine;
  return entries.reduce(applyEntry, base);
}
