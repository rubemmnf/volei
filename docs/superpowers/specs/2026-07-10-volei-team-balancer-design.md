# Volei Team Balancer — Design Spec

Date: 2026-07-10
Status: Approved by user

## Problem

User organizes weekly volleyball with a fixed group of 12 players (3 teams of 4). Teams should vary week to week (people play with different teammates) while staying balanced (competitive matches). Match results feed player ratings so balance improves over time.

## Requirements (confirmed during brainstorming)

- **Platform:** PWA installed to home screen, offline-capable (gyms have bad signal)
- **Users/data:** Single user (the organizer), data on-device only, no server, no auth
- **Player pool:** Always 12 players, 3 teams of 4
- **Match data:** Final score per match (margin of victory feeds Elo)
- **Session flow:** Freeform — organizer picks which 2 of 3 teams play each match
- **Mid-session swap:** App suggests best 1-for-1 player swap when teams turn out lopsided
- **Backup:** Export/import JSON (device holds the only copy of data)

## Architecture

Vite + React + TypeScript static SPA. `vite-plugin-pwa` for offline + install. Tailwind CSS. No router — 4 tab screens via local state. One versioned JSON document in `localStorage`, Zod-validated on load, persisted after every mutation. Deploy to free static hosting; install via "Add to Home Screen".

## Data model

```ts
type Player  = { id: string; name: string; skill: number /* 1-10 */; elo: number; active: boolean }
type Match   = { id: string; sideA: string[]; sideB: string[]; // 4 playerIds each — exact roster snapshot
                 scoreA: number; scoreB: number; timestamp: string }
type Session = { id: string; date: string; teams: [string[], string[], string[]]; matches: Match[];
                 finished: boolean }
type AppState = { version: 1; players: Player[]; sessions: Session[] }
```

Matches snapshot exact rosters (not team indexes) so Elo and familiarity stay exact after mid-session swaps. Ties forbidden (volleyball).

## Algorithm (pure functions)

1. **generateTeams(players, history)** — enumerate all 5,775 partitions of 12 into 3×4.
   Cost = `eloVariance + FAMILIARITY_WEIGHT × familiarityPenalty`.
   Familiarity is recency-decayed: pair contribution = `0.75^weeksAgo` (all-time counts saturate; decay keeps variety pressure on recent weeks).
   New players seed effective Elo from skill: linear map 1-10 → 800-1600.
2. **updateElo(sideA, sideB, scoreA, scoreB)** — team Elo = player average; expected = `1/(1+10^((eloB−eloA)/400))`; K = 32 scaled by `ln(|margin|+1)`; same delta per player on a side; returns deltas (pure).
3. **suggestSwap(teamX, teamY, familiarity)** — minimize post-swap team Elo gap; tie-break on lower familiarity.

## Screens

1. **Players** — roster CRUD (name, skill 1-10), live Elo. Generate requires exactly 12 active.
2. **Teams** — generate 3 balanced teams with Elo totals; manual tap-to-swap override; "Start session".
3. **Session** — courtside dark UI, big touch targets; pick 2 of 3 teams; score entry (no ties, integers ≥ 0); Elo updates immediately; today's match list; undo last match (exact delta revert); swap-suggestion modal; end session.
4. **History** — past sessions + matches; player table sorted by Elo.
5. **Settings** — export/import JSON backup.

## Error handling

- Corrupt/missing stored data → Zod parse fails → offer "start fresh" or "import backup"; never silently wipe.
- Score entry validated: integers ≥ 0, no ties.
- Undo only for last match of active session; Elo deltas stored on match record.

## Testing

Vitest + RTL, TDD. Algorithm heavily tested (partition count 5,775, balance on crafted inputs, Elo math, decay). Component tests: score validation, generate flow, undo.

## Provenance

Ported from prior exploration artifacts (deleted after port): `prisma/schema.prisma`, `src/team-balancing.service.ts` (NestJS), `src/components/CourtsideDashboard.tsx` (Next.js).
