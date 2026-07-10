import { useState } from "react";
import type { AppState } from "../types";
import { exportState, importState } from "../storage";
import { initialState, type AppAction } from "../app-state";

type Props = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  onClose: () => void;
};

export function SettingsModal({ state, dispatch, onClose }: Props) {
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const exported = exportState(state);

  const handleDownload = () => {
    const blob = new Blob([exported], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `volei-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    try {
      const imported = importState(importText);
      dispatch({ type: "replace-state", state: imported });
      setImportText("");
      setError(null);
      onClose();
    } catch {
      setError("Invalid backup file — nothing was changed.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-black text-white">Backup</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 font-bold px-2">
            ✕
          </button>
        </div>

        <p className="text-zinc-500 text-xs">
          All data lives only on this phone. Download a backup now and then.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          className="w-full bg-emerald-500 text-black font-black py-3 rounded-xl"
        >
          Download Backup
        </button>

        <div className="flex flex-col gap-2">
          <label htmlFor="import-json" className="text-xs font-bold text-zinc-500">
            Restore: paste backup JSON
          </label>
          <textarea
            id="import-json"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={4}
            className="w-full bg-black text-white text-xs rounded-xl border border-zinc-700 p-3 font-mono"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="button"
            onClick={handleImport}
            disabled={!importText.trim()}
            className="w-full border border-zinc-700 text-white font-bold py-3 rounded-xl disabled:opacity-30"
          >
            Import (replaces everything)
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (confirmingReset) {
              dispatch({ type: "replace-state", state: initialState() });
              setConfirmingReset(false);
              onClose();
            } else {
              setConfirmingReset(true);
            }
          }}
          className={`w-full font-bold py-3 rounded-xl ${
            confirmingReset ? "bg-red-500 text-black font-black" : "border border-red-500/40 text-red-400"
          }`}
        >
          {confirmingReset ? "Tap Again to Delete Everything" : "Delete All Data"}
        </button>
      </div>
    </div>
  );
}
