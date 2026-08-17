import { useState } from "react";
import type { AppState, Match, Player } from "../types";
import { activeSession, type AppAction } from "../app-state";
import { buildFamiliarityMatrix } from "../algorithm/familiarity";
import { rankSwaps, type RankedSwap } from "../algorithm/suggest-swap";
import { EditScoreModal } from "./EditScoreModal";
import { MatchList } from "./MatchList";
import { ScoreEntry } from "./ScoreEntry";
import { SwapModal } from "./SwapModal";
import { TEAM_META } from "./team-meta";

type SwapContext = { teamA: number; teamB: number; suggestions: RankedSwap[] };

function balancingHint(count: number): string {
  if (count === 0) return "Every match counts toward tonight's winner.";
  if (count === 1) return "The first match doesn't count toward tonight's winner.";
  return `The first ${count} matches don't count toward tonight's winner.`;
}

type Props = {
  state: AppState;
  players: Player[];
  dispatch: (action: AppAction) => void;
};

export function SessionScreen({ state, players, dispatch }: Props) {
  const [selected, setSelected] = useState<number[]>([]);
  const [pendingSwap, setPendingSwap] = useState<SwapContext | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);

  const session = activeSession(state);
  if (!session) {
    return (
      <div className="py-12 text-center text-zinc-500">
        No active session. Generate teams first.
      </div>
    );
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
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
    setSelected((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(-2),
    );
  };

  const handleSave = (scoreA: number, scoreB: number) => {
    const [ia, ib] = selected;
    dispatch({
      type: "record-match",
      match: {
        id: crypto.randomUUID(),
        sideA: session.teams[ia],
        sideB: session.teams[ib],
        scoreA,
        scoreB,
        timestamp: new Date().toISOString(),
      },
    });
  };

  const handleOpenSwap = () => {
    const [ia, ib] = selected;
    const matrix = buildFamiliarityMatrix(state.sessions, new Date());
    const suggestions = rankSwaps(
      resolveTeam(session.teams[ia]),
      resolveTeam(session.teams[ib]),
      matrix,
    );
    setPendingSwap({ teamA: ia, teamB: ib, suggestions });
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
          const meta = TEAM_META[i];
          const order = selected.indexOf(i); // -1 while unselected
          const isSelected = order >= 0;
          return (
            <button
              key={meta.name}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleTeam(i)}
              // bg-zinc-900 is omitted when selected: it and meta.bg both set background-color,
              // and CSS source order — not class order — would decide the winner.
              className={`text-left rounded-2xl p-4 border-2 transition-colors ${
                isSelected
                  ? `${meta.borderStrong} ${meta.bg}`
                  : "bg-zinc-900 border-zinc-800"
              }`}
            >
              <span className="flex items-center gap-2">
                {isSelected && (
                  // aria-hidden keeps the digit out of the accessible name, which tests anchor on.
                  <span
                    aria-hidden="true"
                    className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-black border text-xs font-black ${meta.borderStrong} ${meta.text}`}
                  >
                    {order + 1}
                  </span>
                )}
                <span className={`font-black ${meta.text}`}>{meta.name}</span>
                {isSelected && (
                  <span className="sr-only">
                    {order === 0 ? "picked first" : "picked second"}
                  </span>
                )}
              </span>
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
        // Keyed by the pairing: tapping a third team keeps two teams selected, so without
        // this the typed scores would survive and be recorded against the wrong teams.
        <ScoreEntry
          key={`${selected[0]}-${selected[1]}`}
          teamA={TEAM_META[selected[0]]}
          teamB={TEAM_META[selected[1]]}
          onSave={handleSave}
        />
      )}

      {bothSelected && (
        <button
          type="button"
          onClick={handleOpenSwap}
          className="w-full border border-amber-500/40 text-amber-400 font-bold py-3 rounded-xl"
        >
          Swap Players
        </button>
      )}

      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            Balancing Rounds
          </p>
          <p className="text-xs text-zinc-500 mt-1">{balancingHint(session.balancingRounds)}</p>
        </div>
        <button
          type="button"
          aria-label="Fewer balancing rounds"
          disabled={session.balancingRounds === 0}
          onClick={() =>
            dispatch({ type: "set-balancing-rounds", count: session.balancingRounds - 1 })
          }
          className="w-10 h-10 rounded-xl border border-zinc-700 text-zinc-300 font-black disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center font-black text-white">{session.balancingRounds}</span>
        <button
          type="button"
          aria-label="More balancing rounds"
          onClick={() =>
            dispatch({ type: "set-balancing-rounds", count: session.balancingRounds + 1 })
          }
          className="w-10 h-10 rounded-xl border border-zinc-700 text-zinc-300 font-black"
        >
          +
        </button>
      </div>

      <MatchList
        session={session}
        playerById={playerById}
        title="Today's Matches"
        onEditMatch={setEditingMatch}
      />

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

      {editingMatch && (
        <EditScoreModal
          match={editingMatch}
          session={session}
          playerById={playerById}
          onSave={(scoreA, scoreB) => {
            dispatch({
              type: "edit-match-score",
              sessionId: session.id,
              matchId: editingMatch.id,
              scoreA,
              scoreB,
            });
            setEditingMatch(null);
          }}
          onCancel={() => setEditingMatch(null)}
        />
      )}

      {pendingSwap && (
        <SwapModal
          teamX={resolveTeam(session.teams[pendingSwap.teamA])}
          teamY={resolveTeam(session.teams[pendingSwap.teamB])}
          teamXName={TEAM_META[pendingSwap.teamA].name}
          teamYName={TEAM_META[pendingSwap.teamB].name}
          suggestions={pendingSwap.suggestions}
          onApply={(playerA, playerB) => {
            dispatch({
              type: "apply-swap",
              teamA: pendingSwap.teamA,
              playerA,
              teamB: pendingSwap.teamB,
              playerB,
            });
            setPendingSwap(null);
          }}
          onCancel={() => setPendingSwap(null)}
        />
      )}
    </div>
  );
}

