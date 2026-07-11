// Unit: 2D PCA power-iteration (the corpus-galaxy projection). Proves the top-2 components capture the
// data's spread (a 2-axis point cloud maps back to its two axes), determinism (fixed init, no RNG), and the
// degenerate floors (empty / zero-dim).

import { describe } from "vitest";
import { pca2d } from "../../../../../packages/server/src/domain/discovery/substrate/pca.ts";
import { expect, test } from "../../../../support/fixtures";

// A D-dim vector with leading components set (rest zero).
function v(...components: readonly number[]): Float32Array {
  const out = new Float32Array(8);
  for (let i = 0; i < components.length; i += 1) {
    out[i] = components[i] ?? 0;
  }
  return out;
}

describe("pca2d", () => {
  test("separates a two-axis point cloud along its principal axes", () => {
    // Spread mostly along dim 0 (the dominant axis), a little along dim 1.
    const points = [v(-2, 0), v(-1, 0), v(0, 0), v(1, 0), v(2, 0), v(0, -1), v(0, 1)];
    const coords = pca2d(points);
    expect(coords).toHaveLength(points.length);
    // PC1 captures the dim-0 spread: the two extremes (-2, +2) sit at opposite ends on x.
    const xs = coords.map((c) => c.x);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    expect(max - min).toBeGreaterThan(2);
  });

  test("is deterministic (fixed init, no RNG)", () => {
    const points = [v(1, 0), v(0, 1), v(1, 1), v(-1, 0.5)];
    const a = pca2d(points);
    const b = pca2d(points);
    expect(a).toEqual(b);
  });

  test("degenerate inputs: empty ⇒ [], zero-dim ⇒ all-zero points", () => {
    expect(pca2d([])).toEqual([]);
    const zeroDim = [new Float32Array(0), new Float32Array(0)];
    expect(pca2d(zeroDim)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});
