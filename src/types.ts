import { z } from "zod";
import { DEFAULT_SETTINGS, MAX_SKILL_CEILING, SettingsSchema } from "./settings";

export const MIN_SKILL = 1;

/**
 * The persisted player shape. `elo` is deliberately absent: a rating is derived
 * by replaying match history on top of `baseElo` (see algorithm/derive-ratings),
 * so a mistyped score can be corrected after the fact.
 */
export const StoredPlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /**
   * Validated against the absolute ceiling, not `settings.maxSkill`: the schema
   * cannot see settings, and lowering the scale must not reject a stored player.
   */
  skill: z.number().int().min(MIN_SKILL).max(MAX_SKILL_CEILING),
  baseElo: z.number(),
  active: z.boolean(),
});

const SideSchema = z.array(z.string()).length(4);

export const MatchSchema = z
  .object({
    id: z.string(),
    sideA: SideSchema,
    sideB: SideSchema,
    scoreA: z.number().int().min(0),
    scoreB: z.number().int().min(0),
    timestamp: z.string(),
  })
  .refine((m) => m.scoreA !== m.scoreB, { message: "Volleyball matches cannot end in a tie" });

export const SessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  teams: z.tuple([SideSchema, SideSchema, SideSchema]),
  matches: z.array(MatchSchema),
  finished: z.boolean(),
  /**
   * How many of the opening matches were balancing rounds. They still count for
   * ratings, history and familiarity — only the night's standings ignore them.
   * Defaults so sessions stored before the field existed keep loading.
   */
  balancingRounds: z.number().int().min(0).default(0),
  /**
   * Set once the organizer acts on or dismisses the lopsided-pairing banner.
   * The banner's own button cannot clear its condition — a swap rewrites the
   * teams but not the win/loss record it is derived from — so the acknowledgement
   * has to be stored rather than derived. Defaults for sessions stored before
   * the field existed.
   */
  rebalanceMuted: z.boolean().default(false),
});

export const AppStateSchema = z.object({
  version: z.literal(2),
  players: z.array(StoredPlayerSchema),
  sessions: z.array(SessionSchema),
  /**
   * Defaulted rather than migrated, the same way `balancingRounds` is: every
   * state and backup written before settings existed keeps loading, and picks
   * up the values that used to be hardcoded.
   */
  settings: SettingsSchema.default(DEFAULT_SETTINGS),
});

export type StoredPlayer = z.infer<typeof StoredPlayerSchema>;
/** Runtime player: a stored player with its replayed rating attached. */
export type Player = StoredPlayer & { elo: number };
export type Match = z.infer<typeof MatchSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type AppState = z.infer<typeof AppStateSchema>;
