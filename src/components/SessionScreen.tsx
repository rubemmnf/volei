import { useState } from "react";
import type { AppState, Match, Player } from "../types";
import { activeSession, type AppAction } from "../app-state";
import { buildFamiliarityMatrix } from "../algorithm/familiarity";
import {
  formBias,
  lopsidedPairing,
  teamForm,
  teamStandings,
  type TeamForm,
} from "../algorithm/session-stats";
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
  const [lastSwap, setLastSwap] = useState<string | null>(null);

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
    setLastSwap(null); // the confirmation belongs to the pairing it was made on
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

  // Ratings alone cannot see a team running away with the night: a win moves every
  // player on a side by the same amount, so it never changes who outrates whom.
  // Tonight's record is folded in as an Elo-sum bias instead.
  const form = teamForm(session);

  // What the cards show. Deliberately not `form`: the organizer is reading these to
  // see who is winning the night, and the balancing rounds do not count toward that.
  const standings = teamStandings(session);
  const standingsStarted = standings.some((team) => team.wins + team.losses > 0);

  const openSwapFor = (ia: number, ib: number) => {
    const matrix = buildFamiliarityMatrix(state.sessions, new Date());
    const suggestions = rankSwaps(
      resolveTeam(session.teams[ia]),
      resolveTeam(session.teams[ib]),
      matrix,
      { biasX: formBias(form[ia]), biasY: formBias(form[ib]) },
    );
    setPendingSwap({ teamA: ia, teamB: ib, suggestions });
  };

  const openLopsidedSwap = (leader: number, trailer: number) => {
    setSelected([leader, trailer]);
    openSwapFor(leader, trailer);
  };

  // Muted for the rest of the night once acted on: applying a swap leaves the
  // win/loss record untouched, so the condition that raised the banner is still
  // true afterwards and the banner would otherwise never go away.
  const lopsided = session.rebalanceMuted ? null : lopsidedPairing(session);
  const bothSelected = selected.length === 2;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
        Session · {session.date}
      </h2>

      <p className="text-zinc-500 text-xs">
        Tap the two teams about to play.
        {standingsStarted && " Each card shows tonight's wins–losses and point difference."}
      </p>
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
                {standingsStarted && <StandingChip team={standings[i]} />}
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

      {/*
        Below ScoreEntry, not above it: the banner appears the instant a match is
        saved, and inserting it higher would shove the Save button out from under
        the organizer's thumb. Here it lands next to the swap it is asking for.
      */}
      {lopsided && (
        <LopsidedBanner
          leaderName={TEAM_META[lopsided.leader].name}
          trailerName={TEAM_META[lopsided.trailer].name}
          leaderRecord={record(form[lopsided.leader])}
          trailerRecord={record(form[lopsided.trailer])}
          onRebalance={() => openLopsidedSwap(lopsided.leader, lopsided.trailer)}
          onDismiss={() => dispatch({ type: "mute-rebalance" })}
        />
      )}

      {bothSelected && (
        <button
          type="button"
          onClick={() => openSwapFor(selected[0], selected[1])}
          className="w-full border border-amber-500/40 text-amber-400 font-bold py-3 rounded-xl"
        >
          Swap Players
        </button>
      )}

      {/*
        The teams change above the fold, so the swap needs an acknowledgement down here.
        aria-live rather than role="status": ScoreEntry already owns the one status
        region on this screen, and a second would make it ambiguous to address.
      */}
      <div
        aria-live="polite"
        className="empty:hidden text-center text-sm font-bold text-amber-400"
      >
        {lastSwap}
      </div>

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
            dispatch({ type: "mute-rebalance" });
            setLastSwap(
              `Swapped ${playerById.get(playerA)!.name} ⇄ ${playerById.get(playerB)!.name}`,
            );
            setPendingSwap(null);
          }}
          onCancel={() => setPendingSwap(null)}
        />
      )}
    </div>
  );
}

function record(form: TeamForm): string {
  return `${form.wins}-${form.losses}`;
}

/** `+11` / `-4` / `0`. The sign is the point of the number, so it is always shown. */
function signed(points: number): string {
  return points > 0 ? `+${points}` : `${points}`;
}

function netPointsClass(points: number): string {
  if (points > 0) return "text-emerald-400";
  if (points < 0) return "text-rose-400";
  return "text-zinc-500";
}

/**
 * Tonight's record on the team card the organizer is already tapping.
 *
 * The digits are aria-hidden and restated in words: read out raw, `1-0 +11` lands
 * in the middle of the button's accessible name as "one minus zero plus eleven".
 */
function StandingChip({ team }: { team: TeamForm }) {
  const wins = `${team.wins} ${team.wins === 1 ? "win" : "wins"}`;
  const losses = `${team.losses} ${team.losses === 1 ? "loss" : "losses"}`;
  const diff = `${team.netPoints < 0 ? "minus" : "plus"} ${Math.abs(team.netPoints)} points`;

  return (
    <span className="ml-auto shrink-0 flex items-baseline gap-2 tabular-nums">
      <span aria-hidden="true" className="text-sm font-black text-white">
        {record(team)}
      </span>
      <span aria-hidden="true" className={`text-xs font-bold ${netPointsClass(team.netPoints)}`}>
        {signed(team.netPoints)}
      </span>
      <span className="sr-only">{`${wins}, ${losses}, ${diff}`}</span>
    </span>
  );
}

type LopsidedBannerProps = {
  leaderName: string;
  trailerName: string;
  leaderRecord: string;
  trailerRecord: string;
  onRebalance: () => void;
  onDismiss: () => void;
};

function LopsidedBanner({
  leaderName,
  trailerName,
  leaderRecord,
  trailerRecord,
  onRebalance,
  onDismiss,
}: LopsidedBannerProps) {
  return (
    // A live region rather than a scroll: the banner arrives right after a score is
    // saved, and yanking the page under the organizer's thumb would be worse.
    <div
      role="status"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm text-amber-100">
          <span className="font-black">{leaderName}</span> is running the night at {leaderRecord}
          {" while "}
          <span className="font-black">{trailerName}</span> sits at {trailerRecord}.
        </p>
        <button
          type="button"
          aria-label="Dismiss suggestion"
          onClick={onDismiss}
          className="shrink-0 -mt-1 -mr-1 w-8 h-8 rounded-lg text-amber-300/70 text-lg font-black"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        onClick={onRebalance}
        className="w-full bg-amber-500 text-black font-black py-3 rounded-xl"
      >
        Rebalance {leaderName} ⇄ {trailerName}
      </button>
    </div>
  );
}
