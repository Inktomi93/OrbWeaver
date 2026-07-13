// domain/discovery/substrate/pca — tiny 2D PCA (pure; zero I/O). Projects high-dim card embeddings to a
// plottable plane via power iteration for the top two principal components (no matrix lib). PC2 is
// orthogonalized against PC1 every iter (deflation by projection). Fixed sin(j) init (no RNG) for a stable
// map across reloads; Float64 internally for numerical stability over Float32 embedding rows.

const ITERS = 100;
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

function orthogonalize(v: Float64Array, u: Float64Array): void {
  const p = dot(v, u);
  for (let i = 0; i < v.length; i += 1) {
    v[i] = (v[i] ?? 0) - p * (u[i] ?? 0);
  }
}

function topComponent(
  rows: readonly Float64Array[],
  d: number,
  against: Float64Array | null,
): Float64Array {
  let v = new Float64Array(d);
  for (let j = 0; j < d; j += 1) {
    v[j] = Math.sin(j + 1);
  }
  if (against !== null) {
    orthogonalize(v, against);
  }
  normalize(v);
  for (let it = 0; it < ITERS; it += 1) {
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

/** Empty input → []; a degenerate zero-dim input → all-zero points. */
export function pca2d(vecs: readonly Float32Array[]): { x: number; y: number }[] {
  const n = vecs.length;
  if (n === 0) {
    return [];
  }
  const d = vecs[0]?.length ?? 0;
  if (d === 0) {
    return vecs.map(() => ({ x: 0, y: 0 }));
  }
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
