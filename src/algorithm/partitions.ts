const GROUP_SIZE = 3;
const TEAM_SIZE = 4;
const REQUIRED_PLAYERS = GROUP_SIZE * TEAM_SIZE;

type Combination<T> = { combo: T[]; remaining: T[] };

/**
 * All unique partitions of 12 items into 3 unordered teams of 4 (exactly 5,775).
 * Anchoring the first item of each level avoids counting team orderings twice.
 */
export function getPartitions<T>(items: T[]): [T[], T[], T[]][] {
  if (items.length !== REQUIRED_PLAYERS) {
    throw new Error(`Exactly ${REQUIRED_PLAYERS} items are required`);
  }

  const partitions: [T[], T[], T[]][] = [];
  const [first, ...rest1] = items;

  for (const t1 of getCombinations(rest1, TEAM_SIZE - 1)) {
    const team1 = [first, ...t1.combo];
    const [second, ...rest2] = t1.remaining;

    for (const t2 of getCombinations(rest2, TEAM_SIZE - 1)) {
      const team2 = [second, ...t2.combo];
      partitions.push([team1, team2, t2.remaining]);
    }
  }

  return partitions;
}

function getCombinations<T>(array: T[], size: number): Combination<T>[] {
  if (size === 0) return [{ combo: [], remaining: array }];
  if (array.length === size) return [{ combo: [...array], remaining: [] }];
  if (array.length < size) return [];

  const [first, ...rest] = array;

  const withFirst = getCombinations(rest, size - 1).map((c) => ({
    combo: [first, ...c.combo],
    remaining: c.remaining,
  }));

  const withoutFirst = getCombinations(rest, size).map((c) => ({
    combo: c.combo,
    remaining: [first, ...c.remaining],
  }));

  return [...withFirst, ...withoutFirst];
}
