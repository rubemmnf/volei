import { useState } from "react";
import type { AppState, Player } from "../types";
import { activeSession, type AppAction } from "../app-state";
import { teamElo } from "../algorithm/elo";
import { buildFamiliarityMatrix } from "../algorithm/familiarity";
import { generateTeams } from "../algorithm/generate-teams";
import {
  buildExportModel,
  buildSwapsExportModel,
  exportFilename,
  renderTeamsImage,
} from "../export/teams-image";
import { ExportModal, type ExportTab } from "./ExportModal";
import { SwapSuggestions } from "./SwapSuggestions";
import { TEAM_META } from "./team-meta";

type Preview = [Player[], Player[], Player[]];
type Selection = { team: number; playerId: string };
type PendingExport = ExportTab[];

type Props = {
  state: AppState;
  players: Player[];
  dispatch: (action: AppAction) => void;
  onSessionStarted: () => void;
};

export function TeamsScreen({ state, players, dispatch, onSessionStarted }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);

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

  const attending = players.filter((p) => p.active);
  const canGenerate = attending.length === 12;

  // Preview can outlive the roster it was built from (Settings import / Delete All
  // Data replace state without unmounting this screen) — drop it if any id is gone.
  const rosterIds = new Set(players.map((p) => p.id));
  const validPreview =
    preview && preview.every((team) => team.every((p) => rosterIds.has(p.id)))
      ? preview
      : null;

  const handleToggleAttendance = (playerId: string, active: boolean) => {
    dispatch({ type: "set-player-active", id: playerId, active });
    setPreview(null);
    setSelection(null);
    setPendingExport(null);
  };

  const handleGenerate = () => {
    const matrix = buildFamiliarityMatrix(state.sessions, new Date());
    setPreview(generateTeams(attending, matrix));
    setSelection(null);
    setPendingExport(null);
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

  const handleSuggestedSwap = (a: Selection, b: Selection) => {
    if (!validPreview) return;
    setPreview(swapInPreview(validPreview, a, b));
    setSelection(null);
  };

  const handleExport = () => {
    if (!validPreview) return;
    const now = new Date();
    const teamsOnly = buildExportModel(validPreview, now);
    const withSwaps = buildSwapsExportModel(validPreview, now);

    setPendingExport([
      {
        key: "teams",
        label: "Só os times",
        hint: "Só os times e os nomes — sem pontuação e sem sugestões.",
        alt: teamsOnly.title,
        filename: exportFilename(now),
        render: () => renderTeamsImage(teamsOnly),
      },
      {
        key: "swaps",
        label: "Times + trocas",
        hint: "Os times com o total de cada um, mais as trocas de baixo impacto — para discutir as trocas antes do jogo.",
        alt: withSwaps.title,
        filename: exportFilename(now, true),
        render: () => renderTeamsImage(withSwaps),
      },
    ]);
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
          {[...players]
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
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className={`font-black ${TEAM_META[i].text}`}>{TEAM_META[i].name}</h3>
                  <span className="text-xs font-black text-zinc-500 tabular-nums">
                    {teamElo(team)}
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

          <SwapSuggestions preview={validPreview} onSwap={handleSuggestedSwap} />

          <button
            type="button"
            onClick={handleExport}
            className="w-full border border-zinc-700 text-white font-bold py-4 rounded-xl"
          >
            Exportar imagem
          </button>

          <button
            type="button"
            onClick={handleStart}
            className="w-full bg-white text-black font-black py-4 rounded-xl"
          >
            Start Session
          </button>
        </>
      )}

      {validPreview && pendingExport && (
        <ExportModal
          tabs={pendingExport}
          onClose={() => setPendingExport(null)}
        />
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
