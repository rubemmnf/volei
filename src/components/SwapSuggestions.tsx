import type { Player } from "../types";
import { suggestBalancedSwaps } from "../algorithm/suggest-balanced-swaps";
import { TEAM_META } from "./team-meta";

const PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 2],
];

export type SwapTarget = { team: number; playerId: string };

type Props = {
  preview: Player[][];
  onSwap: (a: SwapTarget, b: SwapTarget) => void;
};

/**
 * Organizer-only: the swaps that move the team totals least, for every pair of
 * teams. Never part of the exported image.
 */
export function SwapSuggestions({ preview, onSwap }: Props) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col gap-4">
      <div>
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Low-impact swaps
        </h3>
        <p className="text-zinc-500 text-xs mt-1">
          Tap one to trade the players. The number is how far each total moves.
        </p>
      </div>

      {PAIRS.map(([x, y]) => (
        <div key={`${x}-${y}`} data-testid={`swaps-${x}-${y}`}>
          <p className="text-xs font-bold mb-2">
            <span className={TEAM_META[x].text}>{TEAM_META[x].name}</span>
            <span className="text-zinc-600"> ⇄ </span>
            <span className={TEAM_META[y].text}>{TEAM_META[y].name}</span>
          </p>
          <ul className="flex flex-col gap-1">
            {suggestBalancedSwaps(preview[x], preview[y]).map((swap) => (
              <li key={`${swap.fromX.id}-${swap.fromY.id}`}>
                <button
                  type="button"
                  aria-label={`Swap ${swap.fromX.name} with ${swap.fromY.name}`}
                  onClick={() =>
                    onSwap(
                      { team: x, playerId: swap.fromX.id },
                      { team: y, playerId: swap.fromY.id },
                    )
                  }
                  className="w-full flex items-center justify-between gap-3 bg-black px-3 py-2 rounded-xl border border-zinc-800/50 text-sm"
                >
                  <span className="font-medium text-zinc-200 text-left">
                    {swap.fromX.name} <span className="text-zinc-600">⇄</span> {swap.fromY.name}
                  </span>
                  <span className="font-black text-zinc-500 tabular-nums">±{swap.shift}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
