import type { Player } from "../types";

const MIN_SKILL = 1;
const MAX_SKILL = 10;
const MIN_ELO = 800;
const MAX_ELO = 1600;
const K_FACTOR = 32;

/** Linear map from a 1-10 skill rating to the 800-1600 Elo range (clamped). */
export function skillToElo(skill: number): number {
  const clamped = Math.max(MIN_SKILL, Math.min(MAX_SKILL, skill));
  const fraction = (clamped - MIN_SKILL) / (MAX_SKILL - MIN_SKILL);
  return Math.round(MIN_ELO + fraction * (MAX_ELO - MIN_ELO));
}

export type EloDeltas = { deltaA: number; deltaB: number };

/**
 * Zero-sum Elo deltas for a match. Team rating is the player average;
 * K is scaled by ln(margin + 1) so blowouts move ratings more.
 * Every player on a side receives the same delta.
 */
export function computeEloDeltas(
  sideA: Player[],
  sideB: Player[],
  scoreA: number,
  scoreB: number,
): EloDeltas {
  if (scoreA === scoreB) {
    throw new Error("Volleyball matches cannot end in a tie");
  }

  const eloA = averageElo(sideA);
  const eloB = averageElo(sideB);
  const expectedA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  const actualA = scoreA > scoreB ? 1 : 0;
  const margin = Math.abs(scoreA - scoreB);

  const deltaA = Math.round(K_FACTOR * Math.log(margin + 1) * (actualA - expectedA));
  return { deltaA, deltaB: -deltaA };
}

function averageElo(team: Player[]): number {
  return team.reduce((sum, p) => sum + p.elo, 0) / team.length;
}
