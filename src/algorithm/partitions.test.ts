import { describe, expect, test } from "vitest";
import { getPartitions } from "./partitions";

const twelve = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);

describe("getPartitions", () => {
  test("produces exactly 5775 partitions for 12 items", () => {
    expect(getPartitions(twelve)).toHaveLength(5775);
  });

  test("every partition is 3 disjoint teams of 4 covering all items", () => {
    const invalid = getPartitions(twelve).filter(([t1, t2, t3]) => {
      if (t1.length !== 4 || t2.length !== 4 || t3.length !== 4) return true;
      return new Set([...t1, ...t2, ...t3]).size !== 12;
    });
    expect(invalid).toHaveLength(0);
  });

  test("no two partitions contain the same grouping", () => {
    const keys = getPartitions(twelve).map((partition) =>
      partition
        .map((team) => [...team].sort().join(","))
        .sort()
        .join("|"),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("throws unless given exactly 12 items", () => {
    expect(() => getPartitions(twelve.slice(0, 8))).toThrow();
  });
});
