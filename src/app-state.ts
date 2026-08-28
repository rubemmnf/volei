import type { AppState, Match, StoredPlayer } from "./types";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { skillToElo } from "./algorithm/elo";

export type AppAction =
  | { type: "add-player"; id: string; name: string; skill: number }
  | { type: "update-player"; id: string; name: string; skill: number }
  | { type: "set-player-active"; id: string; active: boolean }
  | { type: "remove-player"; id: string }
  | { type: "start-session"; id: string; date: string; teams: [string[], string[], string[]] }
  | { type: "end-session" }
  | { type: "record-match"; match: Match }
  | { type: "undo-last-match" }
  | { type: "set-balancing-rounds"; count: number }
  | {
      type: "edit-match-score";
      sessionId: string;
      matchId: string;
      scoreA: number;
      scoreB: number;
    }
  | { type: "apply-swap"; teamA: number; playerA: string; teamB: number; playerB: string }
  | { type: "mute-rebalance" }
  | { type: "update-settings"; settings: Settings }
  | { type: "replace-state"; state: AppState };

export function initialState(): AppState {
  return { version: 2, players: [], sessions: [], settings: DEFAULT_SETTINGS };
}

export function activeSession(state: AppState) {
  return state.sessions.find((s) => !s.finished);
}

export function isPlayerReferenced(state: AppState, playerId: string): boolean {
  return state.sessions.some(
    (s) =>
      s.teams.some((team) => team.includes(playerId)) ||
      s.matches.some((m) => m.sideA.includes(playerId) || m.sideB.includes(playerId)),
  );
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "add-player": {
      const player: StoredPlayer = {
        id: action.id,
        name: action.name,
        skill: action.skill,
        baseElo: skillToElo(action.skill, state.settings),
        active: true,
      };
      return { ...state, players: [...state.players, player] };
    }

    case "update-player": {
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id !== action.id) return p;
          // Reseeding a veteran would rewrite their whole replayed history, so
          // the seed is frozen once the player appears in a session.
          const baseElo = isPlayerReferenced(state, p.id)
            ? p.baseElo
            : skillToElo(action.skill, state.settings);
          return { ...p, name: action.name, skill: action.skill, baseElo };
        }),
      };
    }

    case "set-player-active":
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id ? { ...p, active: action.active } : p,
        ),
      };

    case "remove-player":
      return { ...state, players: state.players.filter((p) => p.id !== action.id) };

    case "start-session": {
      const session = {
        id: action.id,
        date: action.date,
        teams: action.teams,
        matches: [],
        finished: false,
        balancingRounds: state.settings.defaultBalancingRounds,
        rebalanceMuted: false,
      };
      return { ...state, sessions: [...state.sessions, session] };
    }

    case "end-session":
      return mapActiveSession(state, (s) => ({ ...s, finished: true }));

    case "record-match": {
      if (!activeSession(state)) return state;
      return mapActiveSession(state, (s) => ({ ...s, matches: [...s.matches, action.match] }));
    }

    case "undo-last-match": {
      const session = activeSession(state);
      if (!session || session.matches.length === 0) return state;
      return mapActiveSession(state, (s) => ({ ...s, matches: s.matches.slice(0, -1) }));
    }

    // Only the active session: once the night is over its standings are frozen.
    case "set-balancing-rounds":
      return mapActiveSession(state, (s) => ({
        ...s,
        balancingRounds: Math.max(0, Math.trunc(action.count)),
      }));

    case "edit-match-score": {
      // Deliberately not via mapActiveSession: correcting a mistyped score has to
      // reach finished sessions too. Ratings need no fixing up here — they are
      // replayed from these scores.
      if (action.scoreA === action.scoreB) return state;
      return {
        ...state,
        sessions: state.sessions.map((s) => {
          if (s.id !== action.sessionId) return s;
          return {
            ...s,
            matches: s.matches.map((m) =>
              m.id === action.matchId
                ? { ...m, scoreA: action.scoreA, scoreB: action.scoreB }
                : m,
            ),
          };
        }),
      };
    }

    case "apply-swap":
      return mapActiveSession(state, (s) => {
        // Without this, a player id that is not on the team it is swapped from
        // makes the filter below a no-op and grows that team to five, which then
        // fails the 4-player schema on the next load.
        if (
          !s.teams[action.teamA]?.includes(action.playerA) ||
          !s.teams[action.teamB]?.includes(action.playerB)
        ) {
          return s;
        }
        const teams = s.teams.map((team, i) => {
          if (i === action.teamA) {
            return [...team.filter((id) => id !== action.playerA), action.playerB];
          }
          if (i === action.teamB) {
            return [...team.filter((id) => id !== action.playerB), action.playerA];
          }
          return team;
        }) as [string[], string[], string[]];
        return { ...s, teams };
      });

    // Deliberately its own action rather than a side effect of "apply-swap": the
    // swap is a change to the teams, this is the organizer saying they have seen
    // the suggestion. Dismissing the banner without swapping counts too.
    case "mute-rebalance":
      return mapActiveSession(state, (s) => ({ ...s, rebalanceMuted: true }));

    // Tuning only: players and sessions are left alone, so an organizer can
    // retune mid-season without touching the roster or the history.
    case "update-settings":
      return { ...state, settings: action.settings };

    case "replace-state":
      return action.state;
  }
}

function mapActiveSession(
  state: AppState,
  update: (s: AppState["sessions"][number]) => AppState["sessions"][number],
): AppState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.finished ? s : update(s))),
  };
}
