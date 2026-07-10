import { useEffect, useReducer, useState } from "react";
import { activeSession, appReducer, initialState, type AppAction } from "./app-state";
import { importState, loadState, saveState } from "./storage";
import type { AppState } from "./types";
import { PlayersScreen } from "./components/PlayersScreen";
import { TeamsScreen } from "./components/TeamsScreen";
import { SessionScreen } from "./components/SessionScreen";
import { HistoryScreen } from "./components/HistoryScreen";
import { SettingsModal } from "./components/SettingsModal";

type Tab = "players" | "teams" | "session" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "teams", label: "Teams" },
  { id: "session", label: "Session" },
  { id: "history", label: "History" },
];

export default function App() {
  const [loaded] = useState(loadState);
  const [blocked, setBlocked] = useState(loaded.status === "corrupt");
  const [state, dispatch] = useReducer(appReducer, undefined, () =>
    loaded.status === "ok" ? loaded.state : initialState(),
  );
  const [tab, setTab] = useState<Tab>(() =>
    loaded.status === "ok" && activeSession(loaded.state) ? "session" : "players",
  );
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!blocked) saveState(state);
  }, [state, blocked]);

  if (blocked) {
    return (
      <CorruptGate
        onReset={() => setBlocked(false)}
        onImport={(imported) => {
          dispatch({ type: "replace-state", state: imported });
          setBlocked(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans flex flex-col">
      <header className="flex justify-between items-center p-4 pb-2">
        <h1 className="text-2xl font-black tracking-tighter text-white">
          VOLEI<span className="text-emerald-400">.</span>
        </h1>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => setShowSettings(true)}
          className="text-zinc-400 border border-zinc-800 rounded-xl px-3 py-2 font-bold"
        >
          ⛭
        </button>
      </header>

      <main className="flex-1 p-4 pb-24">
        {tab === "players" && <PlayersScreen state={state} dispatch={dispatch} />}
        {tab === "teams" && (
          <TeamsScreen state={state} dispatch={dispatch} onSessionStarted={() => setTab("session")} />
        )}
        {tab === "session" && <SessionScreen state={state} dispatch={dispatch} />}
        {tab === "history" && <HistoryScreen state={state} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-zinc-950/95 border-t border-zinc-800 flex backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-4 text-sm font-bold ${
              tab === id ? "text-emerald-400" : "text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {showSettings && (
        <SettingsModal state={state} dispatch={dispatch} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

type CorruptGateProps = {
  onReset: () => void;
  onImport: (state: AppState) => void;
};

function CorruptGate({ onReset, onImport }: CorruptGateProps) {
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    try {
      onImport(importState(importText));
    } catch {
      setError("That backup is not valid either.");
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-6 flex flex-col gap-4 justify-center max-w-sm mx-auto">
      <h1 className="text-xl font-black text-white">Stored data is corrupted</h1>
      <p className="text-zinc-400 text-sm">
        The saved data on this device could not be read. Paste a backup to restore, or start
        fresh. Nothing is deleted until you choose.
      </p>
      <textarea
        aria-label="Backup JSON"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        rows={5}
        className="w-full bg-zinc-900 text-white text-xs rounded-xl border border-zinc-700 p-3 font-mono"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="button"
        onClick={handleImport}
        disabled={!importText.trim()}
        className="w-full bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
      >
        Restore Backup
      </button>
      <button
        type="button"
        onClick={onReset}
        className="w-full border border-red-500/40 text-red-400 font-bold py-3 rounded-xl"
      >
        Start Fresh (overwrites corrupted data)
      </button>
    </div>
  );
}

export type { AppAction };
