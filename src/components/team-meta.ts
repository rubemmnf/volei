export type TeamMeta = {
  name: string;
  text: string;
  /** Tinted border for resting cards and score inputs. */
  border: string;
  /** Full-opacity border for selected cards and order badges. */
  borderStrong: string;
  bg: string;
  /** Same colour as `text`, for the canvas export which cannot use Tailwind classes. */
  hex: string;
};

// Tailwind cannot resolve class names built at runtime, so every variant is spelled out.
export const TEAM_META: readonly TeamMeta[] = [
  { name: "Time A", text: "text-emerald-400", border: "border-emerald-500/40", borderStrong: "border-emerald-500", bg: "bg-emerald-500/10", hex: "#34d399" },
  { name: "Time B", text: "text-cyan-400", border: "border-cyan-500/40", borderStrong: "border-cyan-500", bg: "bg-cyan-500/10", hex: "#22d3ee" },
  { name: "Time C", text: "text-amber-400", border: "border-amber-500/40", borderStrong: "border-amber-500", bg: "bg-amber-500/10", hex: "#fbbf24" },
];
