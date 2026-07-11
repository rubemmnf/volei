import { useState } from "react";
import type { AppState, Match, Player, Session } from "../types";
import { activeSession, type AppAction } from "../app-state";
import { buildFamiliarityMatrix } from "../algorithm/familiarity";
import { suggestSwap, type SwapSuggestion } from "../algorithm/suggest-swap";
import { computeEloDeltas } from "../algorithm/elo";
import { ScoreEntry } from "./ScoreEntry";
import { SwapModal } from "./SwapModal";
import { TEAM_META } from "./team-meta";

type PendingSwap = SwapSuggestion & { teamA: number; teamB: number };

type Props = {
  state: AppState;
  dispatch: (action: AppAction) => void;
};

export function SessionScreen({ state, dispatch }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap | null>(null);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);

  const session = activeSession(state);
  if (!session) {
    return (
      <div className="py-12 text-center text-zinc-500">
        No active session. Generate teams first.
      </div>
    );
  }

  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const resolveTeam = (ids: string[]): Player[] => ids.map((id) => playerById.get(id)!);

  // A restored backup can contain an unfinished session whose player ids no longer
  // exist in the roster — recover instead of crashing on the lookups below.
  const missingCount = session.teams.flat().filter((id) => !playerById.has(id)).length;
  if (missingCount > 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-zinc-400">
          This session references missing players (likely from a restored backup). End it and
          generate fresh teams.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: "end-session" })}
          className="border border-red-500/40 text-red-400 font-bold px-6 py-3 rounded-xl"
        >
          End Session
        </button>
      </div>
    );
  }

  const toggleTeam = (index: number) => {
    setSwapMessage(null);
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(-2),
    );
  };

  const handleSave = (scoreA: number, scoreB: number) => {
    const [ia, ib] = selected;
    const sideA = session.teams[ia];
    const sideB = session.teams[ib];
    const deltas = computeEloDeltas(resolveTeam(sideA), resolveTeam(sideB), scoreA, scoreB);
    dispatch({
      type: "record-match",
      match: {
        id: crypto.randomUUID(),
        sideA,
        sideB,
        scoreA,
        scoreB,
        deltaA: deltas.deltaA,
        deltaB: deltas.deltaB,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleSuggestSwap = () => {
    const [ia, ib] = selected;
    const matrix = buildFamiliarityMatrix(state.sessions, new Date());
    const suggestion = suggestSwap(resolveTeam(session.teams[ia]), resolveTeam(session.teams[ib]), matrix);
    if (!suggestion) {
      setSwapMessage("Teams are already balanced.");
      return;
    }
    setPendingSwap({ ...suggestion, teamA: ia, teamB: ib });
  };

  const bothSelected = selected.length === 2;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
        Session · {session.date}
      </h2>

      <p className="text-zinc-500 text-xs">Tap the two teams about to play.</p>
      <div className="flex flex-col gap-3">
        {session.teams.map((teamIds, i) => {
          const isSelected = selected.includes(i);
          return (
            <button
              key={TEAM_META[i].name}
              type="button"
              onClick={() => toggleTeam(i)}
              className={`text-left bg-zinc-900 rounded-2xl p-4 border-2 transition-colors ${
                isSelected ? TEAM_META[i].border.replace("/40", "") : "border-zinc-800"
              } ${isSelected ? TEAM_META[i].bg : ""}`}
            >
              <span className={`font-black ${TEAM_META[i].text}`}>{TEAM_META[i].name}</span>
              <span className="block text-sm text-zinc-400 mt-1">
                {resolveTeam(teamIds)
                  .map((p) => p.name)
                  .join(" · ")}
              </span>
            </button>
          );
        })}
      </div>

      {bothSelected && (
        <ScoreEntry
          teamAName={TEAM_META[selected[0]].name}
          teamBName={TEAM_META[selected[1]].name}
          onSave={handleSave}
        />
      )}

      {bothSelected && (
        <button
          type="button"
          onClick={handleSuggestSwap}
          className="w-full border border-amber-500/40 text-amber-400 font-bold py-3 rounded-xl"
        >
          Suggest Swap
        </button>
      )}
      {swapMessage && <p className="text-zinc-400 text-sm text-center">{swapMessage}</p>}

      <MatchList session={session} playerById={playerById} />

      {session.matches.length > 0 && (
        <button
          type="button"
          onClick={() => dispatch({ type: "undo-last-match" })}
          className="w-full border border-zinc-700 text-zinc-300 font-bold py-3 rounded-xl"
        >
          Undo Last Match
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (confirmingEnd) {
            dispatch({ type: "end-session" });
            setConfirmingEnd(false);
            setSelected([]);
          } else {
            setConfirmingEnd(true);
          }
        }}
        className={`w-full font-black py-3 rounded-xl ${
          confirmingEnd ? "bg-red-500 text-black" : "border border-red-500/40 text-red-400"
        }`}
      >
        {confirmingEnd ? "Tap Again to End Session" : "End Session"}
      </button>

      {pendingSwap && (
        <SwapModal
          fromX={pendingSwap.fromX}
          fromY={pendingSwap.fromY}
          teamXName={TEAM_META[pendingSwap.teamA].name}
          teamYName={TEAM_META[pendingSwap.teamB].name}
          onApply={() => {
            dispatch({
              type: "apply-swap",
              teamA: pendingSwap.teamA,
              playerA: pendingSwap.fromX.id,
              teamB: pendingSwap.teamB,
              playerB: pendingSwap.fromY.id,
            });
            setPendingSwap(null);
          }}
          onCancel={() => setPendingSwap(null)}
        />
      )}
    </div>
  );
}

function MatchList({ session, playerById }: { session: Session; playerById: Map<string, Player> }) {
  if (session.matches.length === 0) return null;

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
      <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
        Today's Matches
      </h3>
      <ul className="flex flex-col gap-1">
        {[...session.matches].reverse().map((match) => (
          <li key={match.id} className="text-sm text-zinc-300">
            {matchLabel(match, session, playerById)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function matchLabel(match: Match, session: Session, playerById: Map<string, Player>): string {
  const sideName = (side: string[]) => {
    const index = session.teams.findIndex(
      (team) => team.length === side.length && side.every((id) => team.includes(id)),
    );
    if (index >= 0) return TEAM_META[index].name;
    return side.map((id) => playerById.get(id)?.name ?? "?").join("/");
  };
  return `${sideName(match.sideA)} ${match.scoreA}–${match.scoreB} ${sideName(match.sideB)}`;
}
