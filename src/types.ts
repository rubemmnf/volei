import { z } from "zod";

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  skill: z.number().int().min(1).max(10),
  elo: z.number(),
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
    deltaA: z.number(),
    deltaB: z.number(),
    timestamp: z.string(),
  })
  .refine((m) => m.scoreA !== m.scoreB, { message: "Volleyball matches cannot end in a tie" });

export const SessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  teams: z.tuple([SideSchema, SideSchema, SideSchema]),
  matches: z.array(MatchSchema),
  finished: z.boolean(),
});

export const AppStateSchema = z.object({
  version: z.literal(1),
  players: z.array(PlayerSchema),
  sessions: z.array(SessionSchema),
});

export type Player = z.infer<typeof PlayerSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type AppState = z.infer<typeof AppStateSchema>;
