import { z } from "zod";

/**
 * The hard ceiling the persisted player schema validates against.
 *
 * `settings.maxSkill` is the scale the UI offers, but the schema is module-level
 * and cannot see settings, so it has to accept anything a raised `maxSkill`
 * could have produced. Lowering `maxSkill` later therefore never rejects a
 * player already on the roster.
 */
export const MAX_SKILL_CEILING = 10;

/**
 * Every number that encodes a preference rather than a fact. The defaults are
 * exactly the values that used to be hardcoded, so an existing install behaves
 * identically until something is changed here.
 */
export const SettingsSchema = z.object({
  /** Weekday (0 = Sunday) sessions are dated to, or null to use the day it is started. */
  gameDay: z.number().int().min(0).max(6).nullable().default(null),
  /** `balancingRounds` a freshly started session begins at. */
  defaultBalancingRounds: z.number().int().min(0).max(20).default(0),

  /** Cost of one fully-decayed familiar pair, in Elo-sum-variance units. */
  familiarityWeight: z.number().min(0).max(100_000).default(1000),
  /** How much a past pairing fades per elapsed period. */
  familiarityDecay: z.number().min(0).max(1).default(0.75),
  /** Length of one decay period, in days. */
  sessionPeriodDays: z.number().int().min(1).max(365).default(7),
  /** How many swap options each suggestion list shows. */
  swapSuggestionLimit: z.number().int().min(1).max(16).default(3),

  /** Elo-sum offset per net win when steering mid-session swaps. */
  eloPerNetWin: z.number().min(0).max(1000).default(100),
  /** Elo-sum offset per net point — only separates teams whose records tie. */
  eloPerNetPoint: z.number().min(0).max(1000).default(5),
  /** Net wins at which a team counts as running away with the night. */
  dominanceThreshold: z.number().int().min(1).max(20).default(2),

  /** Elo volatility. Changing it re-rates every past match. */
  kFactor: z.number().min(1).max(200).default(32),
  /** Bottom of the skill-to-Elo seed range. Changing it re-rates every past match. */
  minElo: z.number().int().min(0).max(5000).default(1000),
  /** Top of the skill-to-Elo seed range. Changing it re-rates every past match. */
  maxElo: z.number().int().min(0).max(5000).default(2000),
  /** Top of the skill scale the roster form offers. */
  maxSkill: z.number().int().min(2).max(MAX_SKILL_CEILING).default(5),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Weekday labels for the game-day picker, indexed the way `Date.getDay()` is. */
export const WEEKDAYS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * The date to stamp on a session started at `now`.
 *
 * With a `gameDay` set this snaps back to the most recent one, so scores typed
 * in the next morning still land on the night they were played. Formatting is
 * deliberately local rather than `toISOString()`: a game that starts at 21:00
 * in a UTC-3 zone is already tomorrow in UTC.
 */
export function resolveSessionDate(now: Date, gameDay: number | null): string {
  if (gameDay === null) return toLocalIsoDate(now);

  const daysBack = (now.getDay() - gameDay + 7) % 7;
  const snapped = new Date(now);
  snapped.setDate(snapped.getDate() - daysBack);
  return toLocalIsoDate(snapped);
}

function toLocalIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
