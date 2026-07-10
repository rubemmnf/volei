import type { Session } from "../types";

export const DECAY = 0.75;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type FamiliarityMatrix = Record<string, number>;

export function pairKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
}

export function pairFamiliarity(matrix: FamiliarityMatrix, id1: string, id2: string): number {
  return matrix[pairKey(id1, id2)] ?? 0;
}

/**
 * Recency-decayed co-teammate matrix: a pair that shared a team in a session
 * contributes DECAY^weeksAgo, counted once per session regardless of match
 * count. Pairs are drawn from both the session's locked teams and the actual
 * match rosters, so mid-session swaps are reflected too.
 */
export function buildFamiliarityMatrix(sessions: Session[], refDate: Date): FamiliarityMatrix {
  const matrix: FamiliarityMatrix = {};

  for (const session of sessions) {
    const age = refDate.getTime() - new Date(session.date).getTime();
    const weeksAgo = Math.max(0, Math.floor(age / WEEK_MS));
    const weight = Math.pow(DECAY, weeksAgo);

    const pairs = new Set<string>();
    for (const team of session.teams) addTeamPairs(pairs, team);
    for (const match of session.matches) {
      addTeamPairs(pairs, match.sideA);
      addTeamPairs(pairs, match.sideB);
    }

    for (const key of pairs) {
      matrix[key] = (matrix[key] ?? 0) + weight;
    }
  }

  return matrix;
}

export function teamFamiliarity(team: string[], matrix: FamiliarityMatrix): number {
  let sum = 0;
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      sum += pairFamiliarity(matrix, team[i], team[j]);
    }
  }
  return sum;
}

function addTeamPairs(pairs: Set<string>, team: string[]): void {
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      pairs.add(pairKey(team[i], team[j]));
    }
  }
}
