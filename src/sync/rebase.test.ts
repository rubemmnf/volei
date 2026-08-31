import { describe, expect, test } from "vitest";
import { appReducer, initialState, type AppAction } from "../app-state";
import type { Match } from "../types";
import type { LogEntry } from "./protocol";
import { applyEntry, applyLocal, applySync, emptyEngine, renderState } from "./rebase";

const TEAMS: [string[], string[], string[]] = [
  ["p1", "p2", "p3", "p4"],
  ["p5", "p6", "p7", "p8"],
  ["p9", "p10", "p11", "p12"],
];

const roster: AppAction[] = Array.from({ length: 12 }, (_, i) => ({
  type: "add-player",
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  skill: 3,
}));

const startSession: AppAction = {
  type: "start-session",
  id: "s1",
  date: "2026-07-10",
  teams: TEAMS,
};

const matchAction = (id: string, scoreA: number): AppAction => ({
  type: "record-match",
  match: {
    id,
    sideA: TEAMS[0],
    sideB: TEAMS[1],
    scoreA,
    scoreB: 19,
    timestamp: "2026-07-10T10:00:00.000Z",
  } satisfies Match,
});

/** The server's job, modelled: assign a seq to each action in arrival order. */
function log(...actions: { localId: string; action: AppAction }[]): LogEntry[] {
  return actions.map((a, seq) => ({ seq, localId: a.localId, action: a.action }));
}

const setupEntries = log(
  ...roster.map((action, i) => ({ localId: `seed${i}`, action })),
  { localId: "seed-session", action: startSession },
);

describe("renderState", () => {
  test("is the confirmed state when nothing is pending", () => {
    const engine = applySync(emptyEngine(), true, setupEntries);
    expect(renderState(engine)).toEqual(engine.confirmed);
  });

  test("shows a local action immediately, before the server confirms it", () => {
    let engine = applySync(emptyEngine(), true, setupEntries);
    engine = applyLocal(engine, { localId: "mine", action: matchAction("m1", 25) });

    expect(renderState(engine).sessions[0].matches).toHaveLength(1);
    expect(engine.confirmed.sessions[0].matches).toHaveLength(0);
  });
});

describe("applyEntry", () => {
  test("does not apply our own action twice when its echo arrives", () => {
    let engine = applySync(emptyEngine(), true, setupEntries);
    const action = matchAction("m1", 25);
    engine = applyLocal(engine, { localId: "mine", action });
    engine = applyEntry(engine, { seq: 99, localId: "mine", action });

    expect(engine.pending).toHaveLength(0);
    expect(renderState(engine).sessions[0].matches).toHaveLength(1);
  });

  test("ignores an entry we have already folded in", () => {
    let engine = applySync(emptyEngine(), true, setupEntries);
    const entry: LogEntry = { seq: 5, localId: "other", action: matchAction("m1", 25) };
    engine = applyEntry(engine, entry);
    expect(applyEntry(engine, entry)).toEqual(engine);
  });
});

describe("convergence", () => {
  // The property that matters: two phones that dispatch locally in different
  // orders still agree, because the server's seq order is the only one that
  // survives into `confirmed`.
  test("two clients converge after both see the same server order", () => {
    const mine = { localId: "a1", action: matchAction("m1", 25) };
    const theirs = { localId: "b1", action: matchAction("m2", 21) };

    // Phone A records its match first and sees its own optimistically.
    let a = applySync(emptyEngine(), true, setupEntries);
    a = applyLocal(a, mine);

    // Phone B records a different match, unaware of A's.
    let b = applySync(emptyEngine(), true, setupEntries);
    b = applyLocal(b, theirs);

    // The server happens to order B's first. Both phones apply that order.
    const broadcast = log(theirs, mine).map((e) => ({
      ...e,
      seq: e.seq + setupEntries.length,
    }));
    for (const entry of broadcast) {
      a = applyEntry(a, entry);
      b = applyEntry(b, entry);
    }

    expect(a.pending).toHaveLength(0);
    expect(b.pending).toHaveLength(0);
    expect(renderState(a)).toEqual(renderState(b));
    // Neither match was lost — the failure a whole-blob sync would have caused.
    expect(renderState(a).sessions[0].matches.map((m) => m.id)).toEqual(["m2", "m1"]);
  });
});

describe("applySync", () => {
  test("reset replays from scratch, discarding stale confirmed history", () => {
    let engine = applySync(emptyEngine(), true, setupEntries);
    engine = applyEntry(engine, {
      seq: 50,
      localId: "stale",
      action: matchAction("gone", 25),
    });

    const snapshot = appReducer(initialState(), { type: "replace-state", state: engine.confirmed });
    const compacted: LogEntry[] = [
      { seq: 0, localId: "compact", action: { type: "replace-state", state: snapshot } },
    ];
    const after = applySync(engine, true, compacted);

    expect(after.lastSeq).toBe(0);
    expect(after.confirmed).toEqual(snapshot);
  });

  test("keeps pending work across a reset so nothing typed offline is lost", () => {
    let engine = applySync(emptyEngine(), true, setupEntries);
    engine = applyLocal(engine, { localId: "mine", action: matchAction("m1", 25) });
    const after = applySync(engine, true, setupEntries);

    expect(after.pending).toHaveLength(1);
    expect(renderState(after).sessions[0].matches).toHaveLength(1);
  });
});
