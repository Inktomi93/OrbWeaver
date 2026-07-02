// substrate/csls — the CSLS hub-adjust ranking math (pure). Asserts the load-bearing facts: the adjusted
// score is `max(0, distance − 1 + hubScore)` (LOWER = closer; the clamp is DEMOTE-ONLY — the neo
// invariant the first port dropped), a NULL hub falls back to 0.5 on the SAME scale as a scored row, a
// higher hub PENALIZES (a generic hub vector loses), the comparator breaks clamp-flattened ties on the
// RAW distance (never concat order), and the rerank budget cap trims to the pool.

import { describe } from "vitest";
import {
  compareCsls,
  compareCslsBy,
  cslsAdjust,
  NULL_HUB_FALLBACK,
  rerankPoolByScores,
} from "../../../../../packages/server/src/domain/search/substrate/csls.ts";
import { expect, test } from "../../../../support/fixtures";

describe("cslsAdjust", () => {
  test("is max(0, distance − 1 + hubScore) — the demote-only clamp", () => {
    expect(cslsAdjust(0, 1)).toBeCloseTo(0);
    expect(cslsAdjust(1.2, 0.6)).toBeCloseTo(0.8);
    // The clamp: an anti-hub row (low hubScore) must NEVER go negative and beat a closer match.
    expect(cslsAdjust(0.2, 0.6)).toBe(0);
    expect(cslsAdjust(0.2, 0.1)).toBe(0);
  });

  test("a NULL hub falls back to 0.5 (same scale as a scored row)", () => {
    expect(NULL_HUB_FALLBACK).toBe(0.5);
    expect(cslsAdjust(1.2, null)).toBeCloseTo(cslsAdjust(1.2, NULL_HUB_FALLBACK));
    expect(cslsAdjust(1.2, null)).toBeCloseTo(0.7);
  });

  test("a higher hub score penalizes (worse) at equal distance", () => {
    // A generic hub vector (high hub_score) must NOT win over a sharp match at the same raw distance.
    expect(cslsAdjust(0.7, 0.9)).toBeGreaterThan(cslsAdjust(0.7, 0.5));
  });

  test("hubness can never PROMOTE: the clamped score is never below the zero floor", () => {
    expect(cslsAdjust(0.05, 0)).toBe(0);
    expect(cslsAdjust(0.9, 0)).toBe(0);
  });
});

describe("compareCsls / compareCslsBy", () => {
  test("sorts ascending by the clamped adjusted score (lower = closer = first)", () => {
    const rows = [
      { dist: 1.4, hub: 0.5 }, // adj 0.9
      { dist: 1.1, hub: 0.5 }, // adj 0.6
      { dist: 1.2, hub: 0.5 }, // adj 0.7
    ];
    expect([...rows].sort(compareCsls).map((r) => r.dist)).toEqual([1.1, 1.2, 1.4]);
  });

  test("clamp-flattened ties break on the RAW distance, never concat order", () => {
    // Both clamp to 0 (cos ≥ hub); the genuinely closer row (smaller raw distance) must win even when
    // it arrives LATER in the array (the concat-order trap the tie-break exists to close).
    const farFirst = { dist: 0.4, hub: 0.2 }; // adj 0
    const closer = { dist: 0.1, hub: 0.2 }; // adj 0
    expect([farFirst, closer].sort(compareCsls)[0]).toBe(closer);
  });

  test("compareCslsBy lifts the same ordering over accessor-shaped rows", () => {
    const items = [
      { d: 0.4, h: 0.2 }, // adj 0 — tie, farther
      { d: 1.3, h: 0.5 }, // adj 0.8 — ranked last
      { d: 0.1, h: 0.2 }, // adj 0 — tie, closest
    ];
    const sorted = [...items].sort(
      compareCslsBy(
        (i) => i.d,
        (i) => i.h,
      ),
    );
    expect(sorted.map((i) => i.d)).toEqual([0.1, 0.4, 1.3]);
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
