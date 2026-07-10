export type TeamMeta = {
  name: string;
  text: string;
  border: string;
  bg: string;
};

export const TEAM_META: readonly TeamMeta[] = [
  { name: "Team A", text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  { name: "Team B", text: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
  { name: "Team C", text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10" },
];
