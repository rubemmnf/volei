import type { AppState, Player } from "../types";
import { matchLabel } from "./SessionScreen";

type Props = {
  state: AppState;
};

export function HistoryScreen({ state }: Props) {
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const ranked = [...state.players].sort((a, b) => b.elo - a.elo);
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
        <div key={session.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <div className="flex justify-between items-baseline mb-2">
            <h3 className="font-black text-white">{session.date}</h3>
            <span className="text-xs text-zinc-500 font-bold">
              {session.matches.length} {session.matches.length === 1 ? "match" : "matches"}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {session.matches.map((match) => (
              <li key={match.id} className="text-sm text-zinc-300">
                {matchLabel(match, session, playerById)}
              </li>
            ))}
          </ul>
        </div>
      ))}
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
