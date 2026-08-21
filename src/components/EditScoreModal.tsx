import { useId, useState } from "react";
import type { Match, Player, Session } from "../types";
import { sideName } from "./match-label";

type Props = {
  match: Match;
  session: Session;
  playerById: Map<string, Player>;
  onSave: (scoreA: number, scoreB: number) => void;
  onCancel: () => void;
};

const inputClass =
  "w-full bg-black text-white text-3xl font-black text-center rounded-xl border border-zinc-700 h-16";

/** Corrects a mistyped score on an already-recorded match, in any session. */
export function EditScoreModal({ match, session, playerById, onSave, onCancel }: Props) {
  const [rawA, setRawA] = useState(String(match.scoreA));
  const [rawB, setRawB] = useState(String(match.scoreB));
  const baseId = useId();
  const idA = `${baseId}-a`;
  const idB = `${baseId}-b`;

  const nameA = sideName(match.sideA, session, playerById);
  const nameB = sideName(match.sideB, session, playerById);

  const scoreA = parseScore(rawA);
  const scoreB = parseScore(rawB);
  const isTie = scoreA !== null && scoreB !== null && scoreA === scoreB;
  const valid = scoreA !== null && scoreB !== null && scoreA !== scoreB ? { scoreA, scoreB } : null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit match score"
        className="bg-zinc-900 rounded-2xl p-4 border border-zinc-700 w-full max-w-sm flex flex-col gap-3"
      >
        <h3 className="font-black text-white">Edit score</h3>

        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0">
            <label
              htmlFor={idA}
              className="block text-xs font-black uppercase tracking-widest text-center mb-1 truncate text-zinc-400"
            >
              {nameA}
            </label>
            <input
              id={idA}
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`Score ${nameA}`}
              value={rawA}
              onChange={(e) => setRawA(e.target.value)}
              className={inputClass}
            />
          </div>

          <span className="h-16 flex items-center text-zinc-500 font-black">–</span>

          <div className="flex-1 min-w-0">
            <label
              htmlFor={idB}
              className="block text-xs font-black uppercase tracking-widest text-center mb-1 truncate text-zinc-400"
            >
              {nameB}
            </label>
            <input
              id={idB}
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`Score ${nameB}`}
              value={rawB}
              onChange={(e) => setRawB(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div role="status" className="min-h-5 text-center text-sm font-bold">
          {isTie && <span className="text-red-400">No ties in volleyball</span>}
        </div>

        <p className="text-zinc-500 text-xs text-center">
          Later matches are re-rated automatically.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => valid && onSave(valid.scoreA, valid.scoreB)}
            disabled={!valid}
            className="flex-1 bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-zinc-700 text-white font-bold py-3 rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function parseScore(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}
