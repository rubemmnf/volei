import type { AppState, Match, Player } from "./types";
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
  | { type: "apply-swap"; teamA: number; playerA: string; teamB: number; playerB: string }
  | { type: "replace-state"; state: AppState };

export function initialState(): AppState {
  return { version: 1, players: [], sessions: [] };
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
      const player: Player = {
        id: action.id,
        name: action.name,
        skill: action.skill,
        elo: skillToElo(action.skill),
        active: true,
      };
      return { ...state, players: [...state.players, player] };
    }

    case "update-player": {
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id !== action.id) return p;
          const elo = isPlayerReferenced(state, p.id) ? p.elo : skillToElo(action.skill);
          return { ...p, name: action.name, skill: action.skill, elo };
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
      };
      return { ...state, sessions: [...state.sessions, session] };
    }

    case "end-session":
      return mapActiveSession(state, (s) => ({ ...s, finished: true }));

    case "record-match": {
      if (!activeSession(state)) return state;
      const withMatch = mapActiveSession(state, (s) => ({
        ...s,
        matches: [...s.matches, action.match],
      }));
      return applyDeltas(withMatch, action.match, +1);
    }

    case "undo-last-match": {
      const session = activeSession(state);
      const last = session?.matches.at(-1);
      if (!session || !last) return state;
      const withoutMatch = mapActiveSession(state, (s) => ({
        ...s,
        matches: s.matches.slice(0, -1),
      }));
      return applyDeltas(withoutMatch, last, -1);
    }

    case "apply-swap":
      return mapActiveSession(state, (s) => {
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

function applyDeltas(state: AppState, match: Match, sign: 1 | -1): AppState {
  return {
    ...state,
    players: state.players.map((p) => {
      if (match.sideA.includes(p.id)) return { ...p, elo: p.elo + sign * match.deltaA };
      if (match.sideB.includes(p.id)) return { ...p, elo: p.elo + sign * match.deltaB };
      return p;
    }),
  };
}
