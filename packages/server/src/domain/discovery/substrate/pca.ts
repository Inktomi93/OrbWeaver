// domain/discovery/substrate/pca — tiny 2D PCA (pure; zero I/O). Projects high-dim card embeddings down to a
// plottable plane (the `corpusProjection` "corpus galaxy"). Power iteration for the top TWO principal
// components — no matrix lib, no covariance materialization: each iter is two mat-vec passes over the centered
// data (O(n·d)), sub-ms at our scale (~hundreds of 1024-dim vectors). PC2 is orthogonalized against PC1 every
// iter (deflation by projection) so the two axes are independent. Was neo-tavern `corpus/substrate/pca.ts`.
//
// DETERMINISM: a fixed `sin(j)` init (no RNG) → a stable map across reloads (test-determinism). Operates in
// Float64 internally for numerical stability, over the Float32 embedding rows the rest of the substrate uses.

// Power-iteration step count — 100 is well past convergence for our top-2 at this dim/scale.
const ITERS = 100;
// Below this norm a vector is treated as zero-length (avoid divide-by-zero in the normalize).
const MIN_NORM = 1e-12;

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return s;
}

function normalize(v: Float64Array): void {
  let norm = Math.sqrt(dot(v, v));
  if (norm < MIN_NORM) {
    norm = 1;
  }
  for (let i = 0; i < v.length; i += 1) {
    v[i] = (v[i] ?? 0) / norm;
  }
}

/** Remove the component of `v` along the unit vector `u` (in place) — the PC2 deflation. */
function orthogonalize(v: Float64Array, u: Float64Array): void {
  const p = dot(v, u);
  for (let i = 0; i < v.length; i += 1) {
    v[i] = (v[i] ?? 0) - p * (u[i] ?? 0);
  }
}

/** Top principal component of the centered `rows` via power iteration, optionally kept orthogonal to `against`
 *  (PC2 = the top component of the residual after PC1 is removed). */
function topComponent(
  rows: readonly Float64Array[],
  d: number,
  against: Float64Array | null,
): Float64Array {
  // Deterministic seed: a fixed varied vector (sin(j)) — avoids RNG while not being a data row.
  let v = new Float64Array(d);
  for (let j = 0; j < d; j += 1) {
    v[j] = Math.sin(j + 1);
  }
  if (against !== null) {
    orthogonalize(v, against);
  }
  normalize(v);
  for (let it = 0; it < ITERS; it += 1) {
    // t = Xᵀ(X v): project each row onto v (a scalar), then accumulate the scaled rows.
    const t = new Float64Array(d);
    for (const row of rows) {
      const proj = dot(row, v);
      for (let j = 0; j < d; j += 1) {
        t[j] = (t[j] ?? 0) + proj * (row[j] ?? 0);
      }
    }
    if (against !== null) {
      orthogonalize(t, against);
    }
    normalize(t);
    v = t;
  }
  return v;
}

/**
 * Project `vecs` (N × D) to 2D via the top-2 principal components. Returns one `{ x, y }` per input, in order.
 * Empty input ⇒ `[]`; a degenerate zero-dim input ⇒ all-zero points.
 */
export function pca2d(vecs: readonly Float32Array[]): { x: number; y: number }[] {
  const n = vecs.length;
  if (n === 0) {
    return [];
  }
  const d = vecs[0]?.length ?? 0;
  if (d === 0) {
    return vecs.map(() => ({ x: 0, y: 0 }));
  }
  // Center the columns (subtract the per-dimension mean).
  const colMean = new Float64Array(d);
  for (const v of vecs) {
    for (let j = 0; j < d; j += 1) {
      colMean[j] = (colMean[j] ?? 0) + (v[j] ?? 0);
    }
  }
  for (let j = 0; j < d; j += 1) {
    colMean[j] = (colMean[j] ?? 0) / n;
  }
  const rows = vecs.map((v) => {
    const r = new Float64Array(d);
    for (let j = 0; j < d; j += 1) {
      r[j] = (v[j] ?? 0) - (colMean[j] ?? 0);
    }
    return r;
  });
  const pc1 = topComponent(rows, d, null);
  const pc2 = topComponent(rows, d, pc1);
  return rows.map((r) => ({ x: dot(r, pc1), y: dot(r, pc2) }));
}
