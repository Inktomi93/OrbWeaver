// Unit: seeded k-means — determinism (same seed ⇒ same clustering), cluster separation, normalized centroids
// (esoteric #6), and the k clamp.

import { describe } from "vitest";
import { kmeans } from "../../../../../packages/server/src/domain/discovery/substrate/kmeans.ts";
import { expect, test } from "../../../../support/fixtures";

const v = (...xs: number[]): Float32Array => new Float32Array(xs);
const norm = (a: Float32Array): number => Math.sqrt(a.reduce((s, x) => s + x * x, 0));

describe("kmeans", () => {
  test("empty input yields an empty result", () => {
    expect(kmeans([], 2, 1)).toEqual({ centroids: [], assignments: [] });
  });

  test("is deterministic for the same (vecs, k, seed)", () => {
    const vecs = [v(1, 0), v(0.9, 0.1), v(0, 1), v(0.1, 0.9)];
    const a = kmeans(vecs, 2, 7);
    const b = kmeans(vecs, 2, 7);
    expect(b.assignments).toEqual(a.assignments);
  });

  test("separates two well-separated clusters", () => {
    // Two near [1,0], two near [0,1].
    const vecs = [v(1, 0), v(0.95, 0.05), v(0, 1), v(0.05, 0.95)];
    const { assignments } = kmeans(vecs, 2, 1);
    expect(assignments[0]).toBe(assignments[1]);
    expect(assignments[2]).toBe(assignments[3]);
    expect(assignments[0]).not.toBe(assignments[2]);
  });

  test("returns L2-normalized centroids (esoteric #6)", () => {
    const { centroids } = kmeans([v(2, 0), v(0, 4)], 2, 1);
    for (const c of centroids) {
      expect(norm(c)).toBeCloseTo(1, 5);
    }
  });

  test("clamps k to the population size", () => {
    const { centroids } = kmeans([v(1, 0), v(0, 1)], 9, 1);
    expect(centroids.length).toBeLessThanOrEqual(2);
  });
});
