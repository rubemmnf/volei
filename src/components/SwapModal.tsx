import type { Player } from "../types";

type Props = {
  fromX: Player;
  fromY: Player;
  teamXName: string;
  teamYName: string;
  onApply: () => void;
  onCancel: () => void;
};

export function SwapModal({ fromX, fromY, teamXName, teamYName, onApply, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl">
        <h3 className="text-xl font-black text-white mb-2">Swap Recommended</h3>
        <p className="text-zinc-400 text-sm mb-6">
          This swap brings the team ratings closest together.
        </p>

        <div className="flex justify-between items-center bg-black p-4 rounded-2xl border border-zinc-800 mb-6">
          <div className="text-center flex-1">
            <span className="block text-xs font-bold text-zinc-500 mb-1">{teamXName}</span>
            <span className="font-bold text-emerald-400 text-lg">{fromX.name}</span>
          </div>
          <span className="px-4 text-amber-400 font-black">⇄</span>
          <div className="text-center flex-1">
            <span className="block text-xs font-bold text-zinc-500 mb-1">{teamYName}</span>
            <span className="font-bold text-cyan-400 text-lg">{fromY.name}</span>
          </div>
        </div>

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
            onClick={onApply}
            className="flex-1 bg-amber-500 text-black font-black py-3 rounded-xl"
          >
            Apply Swap
          </button>
        </div>
      </div>
    </div>
  );
}
