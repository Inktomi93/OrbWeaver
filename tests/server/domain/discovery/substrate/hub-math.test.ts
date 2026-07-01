// Unit: CSLS hubness math — the top-K mean cosine, the dense/streaming bit-identity (esoteric #1), and the
// hub-vs-outlier ordering.

import { describe } from "vitest";
import {
  CSLS_K,
  computeGroupHubs,
  HUBNESS_DENSE_MAX,
} from "../../../../../packages/server/src/domain/discovery/substrate/hub-math.ts";
import { expect, test } from "../../../../support/fixtures";

const v = (...xs: number[]): Float32Array => new Float32Array(xs);

describe("computeGroupHubs", () => {
  test("exposes the CSLS constants", () => {
    expect(CSLS_K).toBe(10);
    expect(HUBNESS_DENSE_MAX).toBe(5000);
  });

  test("a group of fewer than 2 vectors yields all-zero hubs", () => {
    expect(computeGroupHubs([])).toEqual([]);
    expect(computeGroupHubs([v(1, 0, 0)])).toEqual([0]);
  });

  test("a vector near everything scores a higher hub than an outlier", () => {
    // Three aligned vectors (mutually cos≈1) + one orthogonal outlier.
    const hubs = computeGroupHubs([v(1, 0), v(1, 0), v(1, 0), v(0, 1)]);
    const [a, b, c, outlier] = hubs;
    expect(a).toBeGreaterThan(outlier ?? 1);
    expect(b).toBeCloseTo(a ?? 0, 6);
    expect(c).toBeCloseTo(a ?? 0, 6);
    expect(outlier).toBeCloseTo(0, 6);
  });

  test("the dense and streaming paths are bit-for-bit identical (esoteric #1)", () => {
    const vecs = [v(1, 0, 2), v(0, 3, 1), v(2, 2, 0), v(1, 1, 1), v(0.5, 0, 4), v(3, 1, 2)];
    const dense = computeGroupHubs(vecs, { denseMax: 100 });
    const streaming = computeGroupHubs(vecs, { denseMax: 0 });
    expect(streaming).toEqual(dense);
  });

  test("k caps the neighbour count averaged", () => {
    // 5 aligned + 1 orthogonal; with k=1 an aligned vector's hub is its single best neighbour (cos 1).
    const vecs = [v(1, 0), v(1, 0), v(1, 0), v(1, 0), v(1, 0), v(0, 1)];
    const hubs = computeGroupHubs(vecs, { k: 1 });
    expect(hubs[0]).toBeCloseTo(1, 6);
  });
});
