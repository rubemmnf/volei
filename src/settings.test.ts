import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, SettingsSchema, resolveSessionDate } from "./settings";

// 27 Aug 2026 is a Thursday; 28 Aug is the Friday after it.
const THURSDAY = 4;

describe("SettingsSchema", () => {
  test("an empty object parses to the defaults", () => {
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });

  test("the defaults are the values that used to be hardcoded", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      gameDay: null,
      defaultBalancingRounds: 0,
      familiarityWeight: 1000,
      familiarityDecay: 0.75,
      sessionPeriodDays: 7,
      swapSuggestionLimit: 3,
      eloPerNetWin: 100,
      eloPerNetPoint: 5,
      dominanceThreshold: 2,
      kFactor: 32,
      minElo: 1000,
      maxElo: 2000,
      maxSkill: 5,
    });
  });

  test("rejects a decay outside 0-1", () => {
    expect(SettingsSchema.safeParse({ familiarityDecay: 1.5 }).success).toBe(false);
  });

  test("rejects a period of zero days, which would divide by zero", () => {
    expect(SettingsSchema.safeParse({ sessionPeriodDays: 0 }).success).toBe(false);
  });

  test("rejects a fractional game day", () => {
    expect(SettingsSchema.safeParse({ gameDay: 2.5 }).success).toBe(false);
  });

  test("accepts a null game day", () => {
    expect(SettingsSchema.parse({ gameDay: null }).gameDay).toBeNull();
  });
});

describe("resolveSessionDate", () => {
  test("uses the day it is called on when no game day is set", () => {
    expect(resolveSessionDate(new Date(2026, 7, 28, 10, 0), null)).toBe("2026-08-28");
  });

  test("formats locally, so a late kickoff is not pushed into tomorrow", () => {
    // 23:30 local is already the next day in UTC for any negative offset.
    expect(resolveSessionDate(new Date(2026, 7, 28, 23, 30), null)).toBe("2026-08-28");
  });

  test("keeps the date when today is the game day", () => {
    expect(resolveSessionDate(new Date(2026, 7, 27, 20, 0), THURSDAY)).toBe("2026-08-27");
  });

  test("snaps back to the game day when scores are typed the next morning", () => {
    expect(resolveSessionDate(new Date(2026, 7, 28, 9, 0), THURSDAY)).toBe("2026-08-27");
  });

  test("snaps to the most recent game day, not the upcoming one", () => {
    // Wednesday: the next Thursday is tomorrow, the last one was a week ago.
    expect(resolveSessionDate(new Date(2026, 7, 26, 20, 0), THURSDAY)).toBe("2026-08-20");
  });
});
