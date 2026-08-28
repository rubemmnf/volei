import { MIN_SKILL } from "../types";
import { DEFAULT_SETTINGS, type Settings } from "../settings";

/** Anything carrying a rating — `Player`, or a raw record mid-migration. */
export type Rated = { elo: number };

type SeedSettings = Pick<Settings, "minElo" | "maxElo" | "maxSkill">;

/** Linear map from a skill rating to the configured Elo seed range (clamped). */
export function skillToElo(
  skill: number,
  { minElo, maxElo, maxSkill }: SeedSettings = DEFAULT_SETTINGS,
): number {
  const clamped = Math.max(MIN_SKILL, Math.min(maxSkill, skill));
  const fraction = (clamped - MIN_SKILL) / (maxSkill - MIN_SKILL);
  return Math.round(minElo + fraction * (maxElo - minElo));
}

/** Combined Elo of a team — the number the organizer balances on. */
export function teamElo(team: Rated[]): number {
  return team.reduce((sum, p) => sum + p.elo, 0);
}

export type EloDeltas = { deltaA: number; deltaB: number };

/**
 * Zero-sum Elo deltas for a match. Team rating is the player average;
 * K is scaled by ln(margin + 1) so blowouts move ratings more.
 * Every player on a side receives the same delta.
 */
export function computeEloDeltas(
  sideA: Rated[],
  sideB: Rated[],
  scoreA: number,
  scoreB: number,
  { kFactor }: Pick<Settings, "kFactor"> = DEFAULT_SETTINGS,
): EloDeltas {
  if (scoreA === scoreB) {
    throw new Error("Volleyball matches cannot end in a tie");
  }

  const eloA = averageElo(sideA);
  const eloB = averageElo(sideB);
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const actualA = scoreA > scoreB ? 1 : 0;
  const margin = Math.abs(scoreA - scoreB);

  const deltaA = Math.round(kFactor * Math.log(margin + 1) * (actualA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

function averageElo(team: Rated[]): number {
  return teamElo(team) / team.length;
}
