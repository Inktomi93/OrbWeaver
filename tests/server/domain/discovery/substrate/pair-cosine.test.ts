// Unit: all-pairs near-duplicate detection — the raw-cosine threshold gate + the CSLS rank key
// (`2·sim − hub_i − hub_j`).

import { describe } from "vitest";
import { MAX_DUPLICATE_VECTORS_PER_SPACE } from "../../../../../packages/server/src/domain/discovery/duplicates/generate.ts";
import { pairsAboveThreshold } from "../../../../../packages/server/src/domain/discovery/substrate/pair-cosine.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const v = (...xs: number[]): Float32Array => new Float32Array(xs);
const ZERO_HUBS = [0, 0, 0];

describe("pairsAboveThreshold", () => {
  test("returns only pairs at/above the raw-cosine threshold", () => {
    // 0 & 1 identical (cos 1); 2 orthogonal to both (cos 0).
    const pairs = pairsAboveThreshold([v(1, 0), v(1, 0), v(0, 1)], ZERO_HUBS, 0.9);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ i: 0, j: 1 });
    expect(pairs[0]?.similarity).toBeCloseTo(1, 6);
  });

  test("the CSLS key deflates a high-hub pair below a low-hub pair at the same cosine", () => {
    // Two identical pairs (both cos 1): (0,1) high-hub, (2,3) low-hub.
    const vecs = [v(1, 0), v(1, 0), v(0, 1), v(0, 1)];
    const hubs = [0.9, 0.9, 0.1, 0.1];
    const pairs = pairsAboveThreshold(vecs, hubs, 0.99);
    const highHub = pairs.find((p) => p.i === 0 && p.j === 1);
    const lowHub = pairs.find((p) => p.i === 2 && p.j === 3);
    // The `2 - a - b` here is the CSLS score DELIBERATELY spelled out by hand (cslsScore = 2·cos − hub_i −
    // hub_j, cos=1) — an INDEPENDENT reference, not a call into the code under test. Do NOT "simplify" it
    // into `cslsScore(...)`: that would make the expectation echo the implementation and the test tautological.
    expect(highHub?.cslsScore).toBeCloseTo(2 - 0.9 - 0.9, 6);
    expect(lowHub?.cslsScore).toBeCloseTo(2 - 0.1 - 0.1, 6);
    expect(lowHub?.cslsScore ?? 0).toBeGreaterThan(highHub?.cslsScore ?? 0);
  });

  test("fewer than 2 vectors yields no pairs", () => {
    expect(pairsAboveThreshold([], [], 0.5)).toEqual([]);
    expect(pairsAboveThreshold([v(1, 0)], [0], 0.5)).toEqual([]);
  });

  test("refuses an over-bound vector corpus before beginning the pair scan", () => {
    const vecs = [v(1), v(1), v(1), v(1), v(1), v(1)];
    expect(() => pairsAboveThreshold(vecs, new Array<number>(vecs.length).fill(0), 0.9, { maxVectors: 5, maxPairs: 100 })).toThrow(
      "pair scan vector limit exceeded: 6 > 5",
    );
  });

  test("the production large-corpus boundary refuses representative 5,001 without allocating pair storage", () => {
    const vecs = Array.from({ length: MAX_DUPLICATE_VECTORS_PER_SPACE + 1 }, () => v(1));
    expect(() =>
      pairsAboveThreshold(vecs, new Array<number>(vecs.length).fill(0), 2, {
        maxVectors: MAX_DUPLICATE_VECTORS_PER_SPACE,
        maxPairs: 10_000,
      }),
    ).toThrow(`pair scan vector limit exceeded: ${MAX_DUPLICATE_VECTORS_PER_SPACE + 1} > ${MAX_DUPLICATE_VECTORS_PER_SPACE}`);
  });

  test("refuses the first qualifying pair beyond the output bound", () => {
    const vecs = [v(1), v(1), v(1)]; // three qualifying pairs
    expect(() => pairsAboveThreshold(vecs, [0, 0, 0], 0.9, { maxVectors: 3, maxPairs: 2 })).toThrow(
      "pair scan output limit exceeded: more than 2 pairs",
    );
  });
});
