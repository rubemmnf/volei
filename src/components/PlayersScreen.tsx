import { useState } from "react";
import { MIN_SKILL, type AppState, type Player } from "../types";
import { isPlayerReferenced, type AppAction } from "../app-state";

/** The scale is a setting, so the option list is built per render, not once. */
function skillScale(maxSkill: number): number[] {
  return Array.from({ length: maxSkill - MIN_SKILL + 1 }, (_, i) => MIN_SKILL + i);
}

/** Middle of the configured scale, so the default sits where "average" does. */
function defaultSkill(maxSkill: number): number {
  return Math.round((MIN_SKILL + maxSkill) / 2);
}

type Props = {
  state: AppState;
  players: Player[];
  dispatch: (action: AppAction) => void;
};

export function PlayersScreen({ state, players, dispatch }: Props) {
  const { maxSkill } = state.settings;
  const skills = skillScale(maxSkill);

  const [name, setName] = useState("");
  const [skill, setSkill] = useState(() => defaultSkill(maxSkill));
  const [editingId, setEditingId] = useState<string | null>(null);

  // Lowering the scale while the form is open would otherwise submit an
  // out-of-range skill, so the pending value is clamped at render.
  const pendingSkill = Math.min(skill, maxSkill);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: "add-player", id: crypto.randomUUID(), name: trimmed, skill: pendingSkill });
    setName("");
    setSkill(defaultSkill(maxSkill));
  };

  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-baseline">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Roster</h2>
        <span className="text-zinc-500 text-sm font-bold">
          {players.length} in roster
        </span>
      </div>

      <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="player-name" className="block text-xs font-bold text-zinc-500 mb-1">
              Name
            </label>
            <input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black text-white rounded-xl border border-zinc-700 px-3 py-3"
            />
          </div>
          <div>
            <label htmlFor="player-skill" className="block text-xs font-bold text-zinc-500 mb-1">
              Skill
            </label>
            <select
              id="player-skill"
              value={pendingSkill}
              onChange={(e) => setSkill(Number(e.target.value))}
              className="bg-black text-white rounded-xl border border-zinc-700 px-3 py-3"
            >
              {skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!name.trim()}
          className="w-full bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
        >
          Add Player
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {sorted.map((player) =>
          editingId === player.id ? (
            <EditRow
              key={player.id}
              player={player}
              skills={skills}
              deletable={!isPlayerReferenced(state, player.id)}
              onSave={(newName, newSkill) => {
                dispatch({ type: "update-player", id: player.id, name: newName, skill: newSkill });
                setEditingId(null);
              }}
              onDelete={() => {
                dispatch({ type: "remove-player", id: player.id });
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <li
              key={player.id}
              className="bg-zinc-900 rounded-xl border border-zinc-800 px-4 py-3 flex items-center gap-3"
            >
              <span className="flex-1 font-bold">{player.name}</span>
              <span className="text-xs text-zinc-500 font-bold">skill {player.skill}</span>
              <span className="text-sm text-emerald-400 font-black">{Math.round(player.elo)}</span>
              <button
                type="button"
                onClick={() => setEditingId(player.id)}
                className="text-zinc-400 text-sm font-bold border border-zinc-700 rounded-lg px-3 py-1"
              >
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

type EditRowProps = {
  player: { name: string; skill: number };
  skills: number[];
  deletable: boolean;
  onSave: (name: string, skill: number) => void;
  onDelete: () => void;
  onCancel: () => void;
};

function EditRow({ player, skills, deletable, onSave, onDelete, onCancel }: EditRowProps) {
  const [name, setName] = useState(player.name);
  // A player stored under a higher scale keeps their value until edited, so the
  // option list has to include it or the select would silently show something else.
  const options = skills.includes(player.skill) ? skills : [...skills, player.skill];
  const [skill, setSkill] = useState(player.skill);

  return (
    <li className="bg-zinc-900 rounded-xl border border-emerald-500/40 px-4 py-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          aria-label="Edit name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 bg-black text-white rounded-xl border border-zinc-700 px-3 py-2"
        />
        <select
          aria-label="Edit skill"
          value={skill}
          onChange={(e) => setSkill(Number(e.target.value))}
          className="bg-black text-white rounded-xl border border-zinc-700 px-2 py-2"
        >
          {options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(name.trim() || player.name, skill)}
          className="flex-1 bg-emerald-500 text-black font-black py-2 rounded-xl"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-zinc-700 text-white font-bold py-2 rounded-xl"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!deletable}
          title={deletable ? undefined : "Player has match history"}
          className="flex-1 border border-red-500/40 text-red-400 font-bold py-2 rounded-xl disabled:opacity-30"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
