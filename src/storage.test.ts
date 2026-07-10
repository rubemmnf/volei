// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { STORAGE_KEY, exportState, importState, loadState, saveState } from "./storage";
import type { AppState } from "./types";

const sampleState: AppState = {
  version: 1,
  players: [{ id: "p1", name: "John", skill: 7, elo: 1200, active: true }],
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
    expect(() => importState(JSON.stringify({ version: 1, players: "x", sessions: [] }))).toThrow();
  });
});
