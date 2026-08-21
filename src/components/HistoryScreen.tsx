import { useState } from "react";
import type { AppState, Match, Player, Session } from "../types";
import type { AppAction } from "../app-state";
import { sessionWinners, teamStats } from "../algorithm/session-stats";
import { buildResultsExportModel, renderResultsImage, resultsFilename } from "../export/results-image";
import { EditScoreModal } from "./EditScoreModal";
import { ExportModal } from "./ExportModal";
import { MatchList } from "./MatchList";
import { TEAM_META } from "./team-meta";

type Props = {
  state: AppState;
  players: Player[];
  dispatch: (action: AppAction) => void;
};

type Editing = { session: Session; match: Match };

export function HistoryScreen({ state, players, dispatch }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [exporting, setExporting] = useState<Session | null>(null);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const ranked = [...players].sort((a, b) => b.elo - a.elo);
  const finished = [...state.sessions].filter((s) => s.finished).reverse();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Rankings</h2>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        {ranked.length === 0 && <p className="text-zinc-500 text-sm p-4">No players yet.</p>}
        {ranked.map((player, i) => (
          <RankRow key={player.id} rank={i + 1} player={player} />
        ))}
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mt-2">
        Past Sessions
      </h2>
      {finished.length === 0 && <p className="text-zinc-500 text-sm">No finished sessions yet.</p>}
      {finished.map((session) => (
        <div
          key={session.id}
          data-testid={`session-${session.id}`}
          className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
        >
          <div className="flex justify-between items-baseline mb-2">
            <h3 className="font-black text-white">{session.date}</h3>
            <span className="text-xs text-zinc-500 font-bold">
              {session.matches.length} {session.matches.length === 1 ? "match" : "matches"}
            </span>
          </div>
          <MatchList
            session={session}
            playerById={playerById}
            onEditMatch={(match) => setEditing({ session, match })}
          />
          <SessionSummary session={session} />
          <button
            type="button"
            onClick={() => setExporting(session)}
            className="w-full mt-3 border border-zinc-700 text-white font-bold py-3 rounded-xl"
          >
            Exportar resultado
          </button>
        </div>
      ))}

      {exporting && (
        <ExportModal
          tabs={[resultsTab(exporting, players)]}
          onClose={() => setExporting(null)}
        />
      )}

      {editing && (
        <EditScoreModal
          match={editing.match}
          session={editing.session}
          playerById={playerById}
          onSave={(scoreA, scoreB) => {
            dispatch({
              type: "edit-match-score",
              sessionId: editing.session.id,
              matchId: editing.match.id,
              scoreA,
              scoreB,
            });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** The one image a finished session exports: who won the night, in Portuguese. */
function resultsTab(session: Session, players: Player[]) {
  const model = buildResultsExportModel(session, players);
  return {
    key: `resultado-${session.id}`,
    label: "Resultado",
    hint: "Campeão, classificação, placares e estatísticas da sessão — pronto para o grupo.",
    alt: model.title,
    filename: resultsFilename(session),
    render: () => renderResultsImage(model),
  };
}

function SessionSummary({ session }: { session: Session }) {
  const stats = teamStats(session);
  const winners = sessionWinners(stats);
  if (winners.length === 0) return null;

  const winnerLabel =
    winners.length === 1
      ? `Winner: ${TEAM_META[winners[0]].name}`
      : `Tie: ${winners.map((index) => TEAM_META[index].name).join(" · ")}`;

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-col gap-1">
      {stats.map((stat) => (
        <div
          key={stat.teamIndex}
          data-testid={`session-stat-${session.id}-${stat.teamIndex}`}
          className="flex items-baseline gap-3 text-sm"
        >
          <span className={`flex-1 font-bold ${TEAM_META[stat.teamIndex].text}`}>
            {TEAM_META[stat.teamIndex].name}
          </span>
          <span className="text-zinc-300 font-bold">{stat.wins}W</span>
          <span className="text-zinc-500 font-bold w-10 text-right">+{stat.pointDiff}</span>
        </div>
      ))}
      <p className="text-white font-black text-sm mt-1">{winnerLabel}</p>
      {session.balancingRounds > 0 && (
        <p className="text-zinc-500 text-xs">
          First {session.balancingRounds} rounds excluded
        </p>
      )}
    </div>
  );
}

function RankRow({ rank, player }: { rank: number; player: Player }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-b-0">
      <span className="text-zinc-600 font-black w-6">{rank}</span>
      <span className="flex-1 font-bold">{player.name}</span>
      <span className="text-xs text-zinc-500 font-bold">skill {player.skill}</span>
      <span className="text-emerald-400 font-black">{Math.round(player.elo)}</span>
    </div>
  );
}
