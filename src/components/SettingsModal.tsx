import { useState } from "react";
import type { AppState } from "../types";
import { exportState, importState } from "../storage";
import { DEFAULT_SETTINGS, SettingsSchema, WEEKDAYS, type Settings } from "../settings";
import { initialState, type AppAction } from "../app-state";

type Props = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  onClose: () => void;
};

/** Every setting except `gameDay`, which needs a picker rather than a number box. */
type NumericKey = Exclude<keyof Settings, "gameDay">;

type Field = { key: NumericKey; label: string; step?: number; hint?: string };

type Group = { title: string; warning?: string; fields: Field[] };

const GROUPS: readonly Group[] = [
  {
    title: "Session",
    fields: [
      {
        key: "defaultBalancingRounds",
        label: "Balancing rounds",
        hint: "Opening matches a new session leaves out of the standings.",
      },
    ],
  },
  {
    title: "Balancing",
    fields: [
      {
        key: "familiarityWeight",
        label: "Familiarity weight",
        step: 50,
        hint: "How hard the generator avoids repeating recent pairings.",
      },
      {
        key: "familiarityDecay",
        label: "Familiarity decay",
        step: 0.05,
        hint: "How much a past pairing fades each period. 0 forgets at once, 1 never forgets.",
      },
      {
        key: "sessionPeriodDays",
        label: "Days per period",
        hint: "How often you play. One period is one decay step.",
      },
      { key: "swapSuggestionLimit", label: "Swap options shown" },
    ],
  },
  {
    title: "Mid-session steering",
    fields: [
      { key: "eloPerNetWin", label: "Elo per net win" },
      { key: "eloPerNetPoint", label: "Elo per net point" },
      {
        key: "dominanceThreshold",
        label: "Runaway threshold",
        hint: "Net wins before the rebalance banner appears.",
      },
    ],
  },
  {
    title: "Ratings",
    warning:
      "Ratings are replayed from match history, so changing these re-rates every past match.",
    fields: [
      { key: "kFactor", label: "K-factor" },
      { key: "minElo", label: "Lowest seed" },
      { key: "maxElo", label: "Highest seed" },
      { key: "maxSkill", label: "Top of skill scale" },
    ],
  },
];

type Draft = Record<NumericKey, string>;

function toDraft(settings: Settings): Draft {
  const draft = {} as Draft;
  for (const group of GROUPS) {
    for (const field of group.fields) draft[field.key] = String(settings[field.key]);
  }
  return draft;
}

export function SettingsModal({ state, dispatch, onClose }: Props) {
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Kept as text so a half-typed number survives the keystroke that makes it
  // temporarily unparseable. Only values that pass the schema reach the store.
  const [draft, setDraft] = useState<Draft>(() => toDraft(state.settings));

  const exported = exportState(state);

  const commitSettings = (settings: Settings) => {
    dispatch({ type: "update-settings", settings });
    setDraft(toDraft(settings));
  };

  const handleNumberChange = (key: NumericKey, raw: string) => {
    setDraft((prev) => ({ ...prev, [key]: raw }));

    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value)) return;

    const parsed = SettingsSchema.safeParse({ ...state.settings, [key]: value });
    if (parsed.success) dispatch({ type: "update-settings", settings: parsed.data });
  };

  const isRejected = (key: NumericKey): boolean => {
    const raw = draft[key];
    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value)) return true;
    return !SettingsSchema.safeParse({ ...state.settings, [key]: value }).success;
  };

  const handleGameDayChange = (raw: string) => {
    commitSettings({ ...state.settings, gameDay: raw === "" ? null : Number(raw) });
  };

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-black text-white">Settings</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 font-bold px-2">
            ✕
          </button>
        </div>

        <section className="flex flex-col gap-5">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Tuning</h4>

          <div className="flex flex-col gap-2">
            <label htmlFor="setting-gameDay" className="text-sm font-bold text-zinc-300">
              Game day
            </label>
            <select
              id="setting-gameDay"
              value={state.settings.gameDay === null ? "" : String(state.settings.gameDay)}
              onChange={(e) => handleGameDayChange(e.target.value)}
              className="w-full bg-black text-white rounded-xl border border-zinc-700 px-3 py-3"
            >
              <option value="">No fixed day (use today)</option>
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-zinc-500 text-xs">
              A session is dated to the most recent one of these, so scores typed the next morning
              still land on the night they were played.
            </p>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h5 className="text-xs font-bold text-zinc-600 uppercase tracking-widest">
                {group.title}
              </h5>
              {group.warning && <p className="text-amber-400/80 text-xs">{group.warning}</p>}
              {group.fields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor={`setting-${field.key}`}
                      className="flex-1 text-sm font-bold text-zinc-300"
                    >
                      {field.label}
                    </label>
                    <input
                      id={`setting-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      step={field.step ?? 1}
                      value={draft[field.key]}
                      onChange={(e) => handleNumberChange(field.key, e.target.value)}
                      aria-invalid={isRejected(field.key)}
                      className={`w-24 bg-black text-white text-right rounded-xl border px-3 py-2 tabular-nums ${
                        isRejected(field.key) ? "border-red-500" : "border-zinc-700"
                      }`}
                    />
                  </div>
                  {field.hint && <p className="text-zinc-500 text-xs">{field.hint}</p>}
                </div>
              ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => commitSettings(DEFAULT_SETTINGS)}
            className="w-full border border-zinc-700 text-white font-bold py-3 rounded-xl"
          >
            Reset Tuning to Defaults
          </button>
        </section>

        <section className="flex flex-col gap-4 border-t border-zinc-800 pt-5">
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Backup</h4>

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
              confirmingReset
                ? "bg-red-500 text-black font-black"
                : "border border-red-500/40 text-red-400"
            }`}
          >
            {confirmingReset ? "Tap Again to Delete Everything" : "Delete All Data"}
          </button>
        </section>
      </div>
    </div>
  );
}
