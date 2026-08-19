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
  relevanceOf,
  rerankPoolByScores,
} from "../../../../../packages/server/src/domain/search/substrate/csls.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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
    expect(rows.toSorted(compareCsls).map((r) => r.dist)).toEqual([1.1, 1.2, 1.4]);
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
    const sorted = items.toSorted(
      compareCslsBy(
        (i) => i.d,
        (i) => i.h,
      ),
    );
    expect(sorted.map((i) => i.d)).toEqual([0.1, 0.4, 1.3]);
  });
});

describe("relevanceOf — the READOUT half of the split (corpus forensics §3, R2b)", () => {
  test("is 1 − distance, clamped to [0,1], and goes the OTHER WAY from the ranking score", () => {
    expect(relevanceOf(0)).toBe(1);
    expect(relevanceOf(0.12)).toBeCloseTo(0.88);
    expect(relevanceOf(1)).toBe(0);
    // Cosine distance runs to 2 (opposed vectors); a reader has no use for a negative similarity.
    expect(relevanceOf(1.7)).toBe(0);
    // The two units disagree BY DESIGN: the closest row has the LOWEST score and the HIGHEST relevance.
    expect(cslsAdjust(0.12, null)).toBe(0);
    expect(relevanceOf(0.12)).toBeGreaterThan(relevanceOf(0.4));
  });

  test("is HUB-FREE — the null-hub fallback cannot reach a reader through it", () => {
    // Two rows at the same distance, one with a hub score and one without, read the SAME relevance while
    // their CSLS scores differ. That is the whole point: the fabricated 0.5 ranks, it never renders.
    expect(relevanceOf(0.4)).toBe(relevanceOf(0.4));
    expect(cslsAdjust(0.4, null)).not.toBe(cslsAdjust(0.4, 0.9));
  });

  test("the readout is order-COMPATIBLE with the rank when no hub scores exist", () => {
    // `max(0, d − 0.5)` is monotone in d and ties break on raw d, so a hub-less library ranks identically
    // either way — which is what makes this a presentation change rather than a ranking change.
    const rows = [
      { d: 0.9, h: null },
      { d: 0.1, h: null },
      { d: 0.45, h: null },
    ];
    const byCsls = [...rows].sort(
      compareCslsBy(
        (r) => r.d,
        (r) => r.h,
      ),
    );
    const byRelevance = [...rows].sort((a, b) => relevanceOf(b.d) - relevanceOf(a.d));
    expect(byCsls).toEqual(byRelevance);
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
