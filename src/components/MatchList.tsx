import type { Match, Player, Session } from "../types";
import { matchLabel } from "./match-label";

type Props = {
  session: Session;
  playerById: Map<string, Player>;
  title?: string;
  onEditMatch: (match: Match) => void;
};

/** Recorded matches for one session. Each row opens the score editor. */
export function MatchList({ session, playerById, title, onEditMatch }: Props) {
  if (session.matches.length === 0) return null;

  return (
    <div className={title ? "bg-zinc-900 rounded-2xl p-4 border border-zinc-800" : undefined}>
      {title && (
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{title}</h3>
      )}
      <ul className="flex flex-col gap-1">
        {session.matches.map((match, index) => {
          const label = matchLabel(match, session, playerById);
          return (
            <li key={match.id}>
              <button
                type="button"
                onClick={() => onEditMatch(match)}
                // The badge is deliberately out of the accessible name: tests and
                // screen readers anchor on the score line alone.
                aria-label={`Edit ${label}`}
                className="w-full text-left text-sm text-zinc-300 rounded-lg px-2 py-1 -mx-2 border border-transparent hover:border-zinc-700 active:border-zinc-600"
              >
                {label}
                {index < session.balancingRounds && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    balancing
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

