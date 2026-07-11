import { useState } from "react";
import type { AppState, Player } from "../types";
import { activeSession, type AppAction } from "../app-state";
import { buildFamiliarityMatrix } from "../algorithm/familiarity";
import { generateTeams } from "../algorithm/generate-teams";
import { TEAM_META } from "./team-meta";

type Preview = [Player[], Player[], Player[]];
type Selection = { team: number; playerId: string };

type Props = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  onSessionStarted: () => void;
};

export function TeamsScreen({ state, dispatch, onSessionStarted }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const session = activeSession(state);
  if (session) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-zinc-400">A session is in progress.</p>
        <button
          type="button"
          onClick={onSessionStarted}
          className="bg-emerald-500 text-black font-black px-6 py-3 rounded-xl"
        >
          Go to Session
        </button>
      </div>
    );
  }

  const attending = state.players.filter((p) => p.active);
  const canGenerate = attending.length === 12;

  // Preview can outlive the roster it was built from (Settings import / Delete All
  // Data replace state without unmounting this screen) — drop it if any id is gone.
  const rosterIds = new Set(state.players.map((p) => p.id));
  const validPreview =
    preview && preview.every((team) => team.every((p) => rosterIds.has(p.id)))
      ? preview
      : null;

  const handleToggleAttendance = (playerId: string, active: boolean) => {
    dispatch({ type: "set-player-active", id: playerId, active });
    setPreview(null);
    setSelection(null);
  };

  const handleGenerate = () => {
    const matrix = buildFamiliarityMatrix(state.sessions, new Date());
    setPreview(generateTeams(attending, matrix));
    setSelection(null);
  };

  const handlePlayerTap = (team: number, playerId: string) => {
    if (!validPreview) return;
    if (!selection || selection.team === team) {
      setSelection({ team, playerId });
      return;
    }
    setPreview(swapInPreview(validPreview, selection, { team, playerId }));
    setSelection(null);
  };

  const handleStart = () => {
    if (!validPreview) return;
    dispatch({
      type: "start-session",
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      teams: validPreview.map((team) => team.map((p) => p.id)) as [string[], string[], string[]],
    });
    setPreview(null);
    onSessionStarted();
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Weekly Teams</h2>

      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
        <div className="flex justify-between items-baseline mb-3">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
            Who's playing today?
          </h3>
          <span
            className={`text-sm font-black ${canGenerate ? "text-emerald-400" : "text-amber-400"}`}
          >
            {attending.length}/12 selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {[...state.players]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((player) => (
              <button
                key={player.id}
                type="button"
                aria-pressed={player.active}
                onClick={() => handleToggleAttendance(player.id, !player.active)}
                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  player.active
                    ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                    : "bg-black border-zinc-800 text-zinc-600"
                }`}
              >
                {player.name}
              </button>
            ))}
        </div>
        {!canGenerate && (
          <p className="text-zinc-500 text-xs mt-3">
            Select exactly 12 players to generate teams.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="w-full bg-emerald-500 text-black font-black py-4 rounded-xl disabled:opacity-30"
      >
        {validPreview ? "Regenerate Teams" : "Generate Teams"}
      </button>

      {validPreview && (
        <>
          <p className="text-zinc-500 text-xs text-center">
            Tap a player on two different teams to swap them manually.
          </p>
          <div className="flex flex-col gap-3">
            {validPreview.map((team, i) => (
              <div
                key={TEAM_META[i].name}
                data-testid={`preview-${TEAM_META[i].name}`}
                className={`bg-zinc-900 rounded-2xl p-4 border ${TEAM_META[i].border}`}
              >
                <div className="flex justify-between items-baseline mb-2">
                  <h3 className={`font-black ${TEAM_META[i].text}`}>{TEAM_META[i].name}</h3>
                  <span className="text-xs text-zinc-500 font-bold">
                    Σ {Math.round(team.reduce((sum, p) => sum + p.elo, 0))}
                  </span>
                </div>
                <ul className="grid grid-cols-2 gap-2">
                  {team.map((player) => {
                    const isSelected = selection?.playerId === player.id;
                    return (
                      <li key={player.id}>
                        <button
                          type="button"
                          onClick={() => handlePlayerTap(i, player.id)}
                          className={`w-full text-left bg-black px-3 py-2 rounded-xl text-sm font-medium border ${
                            isSelected ? "border-white" : "border-zinc-800/50"
                          }`}
                        >
                          {player.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="w-full bg-white text-black font-black py-4 rounded-xl"
          >
            Start Session
          </button>
        </>
      )}
    </div>
  );
}

function swapInPreview(preview: Preview, a: Selection, b: Selection): Preview {
  const playerAt = (sel: Selection) => preview[sel.team].find((p) => p.id === sel.playerId)!;
  const playerA = playerAt(a);
  const playerB = playerAt(b);

  return preview.map((team, i) => {
    if (i === a.team) return team.map((p) => (p.id === playerA.id ? playerB : p));
    if (i === b.team) return team.map((p) => (p.id === playerB.id ? playerA : p));
    return team;
  }) as Preview;
}
