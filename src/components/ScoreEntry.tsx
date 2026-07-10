import { useState } from "react";

type Props = {
  teamAName: string;
  teamBName: string;
  onSave: (scoreA: number, scoreB: number) => void;
};

export function ScoreEntry({ teamAName, teamBName, onSave }: Props) {
  const [rawA, setRawA] = useState("");
  const [rawB, setRawB] = useState("");

  const scoreA = parseScore(rawA);
  const scoreB = parseScore(rawB);
  const canSave = scoreA !== null && scoreB !== null && scoreA !== scoreB;
  const isTie = scoreA !== null && scoreB !== null && scoreA === scoreB;

  const handleSave = () => {
    if (scoreA === null || scoreB === null) return;
    onSave(scoreA, scoreB);
    setRawA("");
    setRawB("");
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={`Score ${teamAName}`}
          placeholder="0"
          value={rawA}
          onChange={(e) => setRawA(e.target.value)}
          className="flex-1 min-w-0 bg-black text-white text-3xl font-black text-center rounded-xl border border-zinc-700 h-16"
        />
        <span className="text-zinc-500 font-black">–</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={`Score ${teamBName}`}
          placeholder="0"
          value={rawB}
          onChange={(e) => setRawB(e.target.value)}
          className="flex-1 min-w-0 bg-black text-white text-3xl font-black text-center rounded-xl border border-zinc-700 h-16"
        />
      </div>
      {isTie && <p className="text-red-400 text-sm mt-2 text-center">No ties in volleyball</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="w-full mt-3 bg-emerald-500 text-black font-black py-4 rounded-xl disabled:opacity-30 active:scale-[0.98] transition-transform"
      >
        Save Match
      </button>
    </div>
  );
}

function parseScore(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}
