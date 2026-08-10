import { useId, useState } from "react";
import type { TeamMeta } from "./team-meta";

type Props = {
  teamA: TeamMeta;
  teamB: TeamMeta;
  onSave: (scoreA: number, scoreB: number) => void;
};

const inputClass =
  "w-full bg-black text-white text-3xl font-black text-center rounded-xl border h-16";
const labelClass =
  "block text-xs font-black uppercase tracking-widest text-center mb-1 truncate";

export function ScoreEntry({ teamA, teamB, onSave }: Props) {
  const [rawA, setRawA] = useState("");
  const [rawB, setRawB] = useState("");
  const baseId = useId();
  const idA = `${baseId}-a`;
  const idB = `${baseId}-b`;

  const scoreA = parseScore(rawA);
  const scoreB = parseScore(rawB);
  const isTie = scoreA !== null && scoreB !== null && scoreA === scoreB;
  // One object rather than a boolean so the scores stay narrowed to `number` below.
  const preview =
    scoreA !== null && scoreB !== null && scoreA !== scoreB
      ? {
          scoreA,
          scoreB,
          aWins: scoreA > scoreB,
          winner: scoreA > scoreB ? teamA.name : teamB.name,
        }
      : null;

  const handleSave = () => {
    if (!preview) return;
    onSave(preview.scoreA, preview.scoreB);
    setRawA("");
    setRawB("");
  };

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-end gap-3">
        <div className="flex-1 min-w-0">
          <label htmlFor={idA} className={`${labelClass} ${teamA.text}`}>
            {teamA.name}
          </label>
          <input
            id={idA}
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={`Score ${teamA.name}`}
            placeholder="0"
            value={rawA}
            onChange={(e) => setRawA(e.target.value)}
            className={`${inputClass} ${teamA.border}`}
          />
        </div>

        <span className="h-16 flex items-center text-zinc-500 font-black">–</span>

        <div className="flex-1 min-w-0">
          <label htmlFor={idB} className={`${labelClass} ${teamB.text}`}>
            {teamB.name}
          </label>
          <input
            id={idB}
            type="number"
            min={0}
            inputMode="numeric"
            aria-label={`Score ${teamB.name}`}
            placeholder="0"
            value={rawB}
            onChange={(e) => setRawB(e.target.value)}
            className={`${inputClass} ${teamB.border}`}
          />
        </div>
      </div>

      {/* Always mounted so the Save button never shifts and the live region can announce. */}
      <div role="status" className="mt-2 min-h-6 text-center text-sm font-bold">
        {isTie && <span className="text-red-400">No ties in volleyball</span>}
        {preview && (
          <>
            <span className={preview.aWins ? `font-black ${teamA.text}` : "text-zinc-500"}>
              {teamA.name} {preview.scoreA}
            </span>
            <span className="text-zinc-600">{" – "}</span>
            <span className={preview.aWins ? "text-zinc-500" : `font-black ${teamB.text}`}>
              {preview.scoreB} {teamB.name}
            </span>
            <span className="sr-only">{`, ${preview.winner} wins`}</span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!preview}
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
