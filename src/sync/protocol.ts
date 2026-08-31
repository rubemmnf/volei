import { z } from "zod";
import { AppStateSchema, MatchSchema, MIN_SKILL, SideSchema } from "../types";
import { MAX_SKILL_CEILING, SettingsSchema } from "../settings";
import type { AppAction } from "../app-state";

/**
 * A Zod mirror of the `AppAction` union.
 *
 * Actions arriving over the network are replayed through `appReducer`, which
 * trusts its input completely — it is a pure function over a hand-written union
 * with no runtime checks of its own. So everything crossing the socket is parsed
 * here first. `parseAction` below is typed to return `AppAction`, which makes
 * `tsc` fail if this schema ever drifts from the union it mirrors.
 */
export const AppActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add-player"),
    id: z.string(),
    name: z.string().min(1),
    skill: z.number().int().min(MIN_SKILL).max(MAX_SKILL_CEILING),
  }),
  z.object({
    type: z.literal("update-player"),
    id: z.string(),
    name: z.string().min(1),
    skill: z.number().int().min(MIN_SKILL).max(MAX_SKILL_CEILING),
  }),
  z.object({
    type: z.literal("set-player-active"),
    id: z.string(),
    active: z.boolean(),
  }),
  z.object({ type: z.literal("remove-player"), id: z.string() }),
  z.object({
    type: z.literal("start-session"),
    id: z.string(),
    date: z.string(),
    teams: z.tuple([SideSchema, SideSchema, SideSchema]),
  }),
  z.object({ type: z.literal("end-session") }),
  z.object({ type: z.literal("record-match"), match: MatchSchema }),
  z.object({ type: z.literal("undo-last-match"), matchId: z.string().optional() }),
  z.object({
    type: z.literal("set-balancing-rounds"),
    count: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("edit-match-score"),
    sessionId: z.string(),
    matchId: z.string(),
    scoreA: z.number().int().min(0),
    scoreB: z.number().int().min(0),
  }),
  z.object({
    type: z.literal("apply-swap"),
    teamA: z.number().int().min(0).max(2),
    playerA: z.string(),
    teamB: z.number().int().min(0).max(2),
    playerB: z.string(),
  }),
  z.object({ type: z.literal("mute-rebalance") }),
  z.object({ type: z.literal("update-settings"), settings: SettingsSchema }),
  z.object({ type: z.literal("replace-state"), state: AppStateSchema }),
]);

/** One entry in a room's append-only log. `seq` is assigned by the server. */
export const LogEntrySchema = z.object({
  seq: z.number().int().min(0),
  /** Client-generated, so the sender recognises the echo of its own action. */
  localId: z.string(),
  action: AppActionSchema,
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** First message on every connection. `since` is the first seq still needed. */
  z.object({ type: z.literal("hello"), since: z.number().int().min(0) }),
  z.object({ type: z.literal("append"), localId: z.string(), action: AppActionSchema }),
  /**
   * Collapses the log to a single snapshot so it cannot grow without bound.
   * `atSeq` is the seq the snapshot was folded up to; the server rejects it if
   * the log has moved on since, so a compaction can never swallow an entry.
   */
  z.object({
    type: z.literal("compact"),
    localId: z.string(),
    atSeq: z.number().int().min(0),
    state: AppStateSchema,
  }),
]);

export const ServerMessageSchema = z.discriminatedUnion("type", [
  /**
   * `reset` means replay from `initialState()` rather than appending to what the
   * client already has — it is set when the client is behind a compaction and
   * the entries it missed no longer exist individually.
   */
  z.object({ type: z.literal("sync"), reset: z.boolean(), entries: z.array(LogEntrySchema) }),
  z.object({ type: z.literal("entry"), entry: LogEntrySchema }),
  /**
   * The log has grown past its threshold. Whichever client is fully caught up
   * and has nothing pending answers with a `compact`. Asking rather than having
   * clients count entries keeps the bookkeeping in one place — the server is the
   * only party that knows the true log length.
   */
  z.object({ type: z.literal("need-compaction"), atSeq: z.number().int().min(0) }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type LogEntry = z.infer<typeof LogEntrySchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * Half of the drift guard: if the schema stops producing something assignable
 * to `AppAction`, this stops compiling. That catches a schema arm the reducer
 * cannot handle.
 */
export function parseAction(value: unknown): AppAction {
  return AppActionSchema.parse(value);
}

/**
 * The other half, and the one that matters more: adding a variant to
 * `AppAction` without an arm here stops compiling, instead of shipping an action
 * that every other phone silently rejects. Used on the way out to the socket.
 */
export function toWireAction(action: AppAction): z.infer<typeof AppActionSchema> {
  return action;
}

export function parseServerMessage(raw: string): ServerMessage {
  return ServerMessageSchema.parse(JSON.parse(raw));
}

export function parseClientMessage(raw: string): ClientMessage {
  return ClientMessageSchema.parse(JSON.parse(raw));
}
