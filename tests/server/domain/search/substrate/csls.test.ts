// substrate/csls — the CSLS hub-adjust ranking math (pure). Asserts the load-bearing facts: the adjusted
// score is `distance − 1 + hubScore` (LOWER = closer), a NULL hub falls back to 0.5 on the SAME scale as a
// scored row, a higher hub PENALIZES (a generic hub vector loses), the comparators sort ascending, and the
// rerank budget cap trims to the pool.

import { describe, expect, test } from "vitest";
import {
  compareCsls,
  compareCslsBy,
  cslsAdjust,
  NULL_HUB_FALLBACK,
  rerankPoolByScores,
} from "../../../../../packages/server/src/domain/search/substrate/csls.ts";

describe("cslsAdjust", () => {
  test("is distance − 1 + hubScore", () => {
    expect(cslsAdjust(0, 1)).toBeCloseTo(0);
    expect(cslsAdjust(0.2, 0.6)).toBeCloseTo(-0.2);
  });

  test("a NULL hub falls back to 0.5 (same scale as a scored row)", () => {
    expect(NULL_HUB_FALLBACK).toBe(0.5);
    expect(cslsAdjust(0.2, null)).toBeCloseTo(cslsAdjust(0.2, NULL_HUB_FALLBACK));
    expect(cslsAdjust(0.2, null)).toBeCloseTo(-0.3);
  });

  test("a higher hub score penalizes (worse) at equal distance", () => {
    // A generic hub vector (high hub_score) must NOT win over a sharp match at the same raw distance.
    expect(cslsAdjust(0.2, 0.9)).toBeGreaterThan(cslsAdjust(0.2, 0.5));
  });
});

describe("compareCsls / compareCslsBy", () => {
  test("sorts ascending (lower CSLS = closer = first)", () => {
    expect([3, 1, 2].sort(compareCsls)).toEqual([1, 2, 3]);
  });

  test("compareCslsBy orders objects by their extracted score ascending", () => {
    const items = [{ s: 0.5 }, { s: -0.2 }, { s: 0.1 }];
    const sorted = [...items].sort(compareCslsBy((i) => i.s));
    expect(sorted.map((i) => i.s)).toEqual([-0.2, 0.1, 0.5]);
  });
});

describe("rerankPoolByScores", () => {
  test("trims an already-sorted list to the budget cap", () => {
    expect(rerankPoolByScores(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
  });

  test("a non-positive cap yields an empty pool", () => {
    expect(rerankPoolByScores(["a", "b"], 0)).toEqual([]);
  });

  test("a cap beyond the length keeps everything", () => {
    expect(rerankPoolByScores(["a", "b"], 10)).toEqual(["a", "b"]);
  });
});
