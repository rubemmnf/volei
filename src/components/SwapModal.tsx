import { useState } from "react";
import type { Player } from "../types";
import { teamElo } from "../algorithm/elo";
import type { RankedSwap } from "../algorithm/suggest-swap";

type Props = {
  teamX: Player[];
  teamY: Player[];
  teamXName: string;
  teamYName: string;
  suggestions: RankedSwap[];
  onApply: (playerXId: string, playerYId: string) => void;
  onCancel: () => void;
};

export function SwapModal({
  teamX,
  teamY,
  teamXName,
  teamYName,
  suggestions,
  onApply,
  onCancel,
}: Props) {
  const [isManual, setIsManual] = useState(false);
  const [picked, setPicked] = useState(0);
  const [pickX, setPickX] = useState<string | null>(null);
  const [pickY, setPickY] = useState<string | null>(null);

  const manualPair =
    pickX && pickY
      ? { fromX: teamX.find((p) => p.id === pickX)!, fromY: teamY.find((p) => p.id === pickY)! }
      : null;
  const pair = isManual ? manualPair : (suggestions[picked] ?? null);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <h3 className="text-xl font-black text-white mb-2">Swap Players</h3>

        {isManual ? (
          <ManualPicker
            teamX={teamX}
            teamY={teamY}
            teamXName={teamXName}
            teamYName={teamYName}
            pickX={pickX}
            pickY={pickY}
            onPickX={setPickX}
            onPickY={setPickY}
            pair={manualPair}
          />
        ) : (
          <SuggestionList
            suggestions={suggestions}
            teamXName={teamXName}
            teamYName={teamYName}
            picked={picked}
            onPick={setPicked}
          />
        )}

        <button
          type="button"
          onClick={() => setIsManual((prev) => !prev)}
          className="w-full text-sm font-bold text-amber-400 underline underline-offset-4 py-2 mb-4"
        >
          {isManual ? "Back to suggestions" : "Choose manually"}
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-transparent border border-zinc-700 text-white font-bold py-3 rounded-xl"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!pair}
            onClick={() => pair && onApply(pair.fromX.id, pair.fromY.id)}
            className="flex-1 bg-amber-500 text-black font-black py-3 rounded-xl disabled:opacity-40"
          >
            Apply Swap
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionList({
  suggestions,
  teamXName,
  teamYName,
  picked,
  onPick,
}: {
  suggestions: RankedSwap[];
  teamXName: string;
  teamYName: string;
  picked: number;
  onPick: (index: number) => void;
}) {
  if (suggestions.length === 0) {
    return <p className="text-zinc-400 text-sm mb-4">Choose manually to trade anyway.</p>;
  }

  // Never "already balanced": the list is ranked on ratings plus tonight's results, so
  // a team being run over still gets options even when no swap closes the gap outright.
  const anyImproves = suggestions.some((swap) => swap.improves);

  return (
    <>
      <p className="text-zinc-400 text-sm mb-4">
        {anyImproves
          ? "Closest ratings first. Pick one, or choose your own."
          : "No swap evens these teams out — these are the least uneven."}
      </p>
      <ul className="flex flex-col gap-2 mb-2">
        {suggestions.map((swap, i) => (
          <li key={`${swap.fromX.id}-${swap.fromY.id}`}>
            <button
              type="button"
              aria-label={`Swap ${swap.fromX.name} with ${swap.fromY.name}`}
              aria-pressed={i === picked}
              onClick={() => onPick(i)}
              className={`w-full flex items-center gap-2 p-3 rounded-2xl border text-left ${
                i === picked ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-black"
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-zinc-500">
                  {teamXName} ⇄ {teamYName}
                </span>
                <span className="block font-bold text-white truncate">
                  {swap.fromX.name} ⇄ {swap.fromY.name}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs font-bold text-zinc-500">
                <span className="block">gap {Math.round(swap.gapAfter)}</span>
                {!swap.improves && <span className="block text-zinc-600">no gain</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ManualPicker({
  teamX,
  teamY,
  teamXName,
  teamYName,
  pickX,
  pickY,
  onPickX,
  onPickY,
  pair,
}: {
  teamX: Player[];
  teamY: Player[];
  teamXName: string;
  teamYName: string;
  pickX: string | null;
  pickY: string | null;
  onPickX: (id: string) => void;
  onPickY: (id: string) => void;
  pair: { fromX: Player; fromY: Player } | null;
}) {
  const gapAfter = pair ? gapAfterSwap(teamX, teamY, pair.fromX, pair.fromY) : null;

  return (
    <>
      <p className="text-zinc-400 text-sm mb-4">Pick one player from each team.</p>
      <div className="flex gap-2 mb-2">
        <PlayerColumn team={teamX} teamName={teamXName} picked={pickX} onPick={onPickX} />
        <PlayerColumn team={teamY} teamName={teamYName} picked={pickY} onPick={onPickY} />
      </div>
      <p role="status" className="text-center text-xs font-bold text-zinc-500 h-4 mb-2">
        {gapAfter === null ? "" : `Rating gap after swap: ${Math.round(gapAfter)}`}
      </p>
    </>
  );
}

function PlayerColumn({
  team,
  teamName,
  picked,
  onPick,
}: {
  team: Player[];
  teamName: string;
  picked: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-zinc-500 mb-1">{teamName}</span>
      <div className="flex flex-col gap-1">
        {team.map((player) => (
          <button
            key={player.id}
            type="button"
            aria-pressed={player.id === picked}
            onClick={() => onPick(player.id)}
            className={`w-full px-2 py-2 rounded-xl border text-sm font-bold truncate ${
              player.id === picked
                ? "border-amber-500 bg-amber-500/10 text-white"
                : "border-zinc-800 bg-black text-zinc-300"
            }`}
          >
            {player.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function gapAfterSwap(teamX: Player[], teamY: Player[], fromX: Player, fromY: Player): number {
  const sumX = teamElo(teamX) - fromX.elo + fromY.elo;
  const sumY = teamElo(teamY) - fromY.elo + fromX.elo;
  return Math.abs(sumX - sumY);
}
