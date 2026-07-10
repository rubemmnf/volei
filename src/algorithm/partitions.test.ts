import { describe, expect, test } from "vitest";
import { getPartitions } from "./partitions";

const twelve = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);

describe("getPartitions", () => {
  test("produces exactly 5775 partitions for 12 items", () => {
    expect(getPartitions(twelve)).toHaveLength(5775);
  });

  test("every partition is 3 disjoint teams of 4 covering all items", () => {
    for (const [t1, t2, t3] of getPartitions(twelve)) {
      expect(t1).toHaveLength(4);
      expect(t2).toHaveLength(4);
      expect(t3).toHaveLength(4);
      const all = new Set([...t1, ...t2, ...t3]);
      expect(all.size).toBe(12);
    }
  });

  test("no two partitions contain the same grouping", () => {
    const seen = new Set<string>();
    for (const partition of getPartitions(twelve)) {
      const key = partition
        .map((team) => [...team].sort().join(","))
        .sort()
        .join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  test("throws unless given exactly 12 items", () => {
    expect(() => getPartitions(twelve.slice(0, 8))).toThrow();
  });
});
