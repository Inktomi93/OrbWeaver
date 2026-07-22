// Vector math substrate — the ONE home for cosine / centroid / pairwise primitives that the
// corpus / chat-memory features each used to hand-roll (memory/utils' cosineSim and the
// duplicate-pair substrate's all-pairs cosine collapse to these). Pure JS over Float32Array (V8
// JITs these loops to SIMD-adjacent code); at corpus scale (≤ a few thousand 1024-dim vectors per
// pass) the JS loops are fast enough and dependency-free. Zero I/O — testable in isolation; domains
// import this freely (it's the leaf below them in the layer cake).
//
// Two tiers:
//   • Pure JS helpers (cosineSim, l2Normalize, mean) — single-pair / single-vector work; the hot
//     per-query rerank paths.
//   • Flat-buffer JS batch ops (pairwiseCosine, cosineToMany) — N² or N×K work, normalized once into
//     a contiguous Float32Array buffer for better V8 JIT locality (avoids per-call renormalization).

// Replaces a missing / zero-norm vector so a divide-by-norm never yields NaN (the `|| ZERO_NORM_GUARD`
// pattern below): a zero-norm vector normalizes to itself (all zeros).
const ZERO_NORM_GUARD = 1;

// ── Pure JS (single-pair / single-vector) ───────────────────────────────────

/**
 * Cosine similarity of two L2-normalized vectors (the embedder normalizes). Throws on dim
 * mismatch — pre-fix the old chat/memory `cosineSim` silently took `Math.min(a, b)` and computed
 * a half-vector dot product, exactly what a mid-corpus embedder swap looks like as a
 * loud-but-unobvious accuracy drop. A loud error trips during dev/CI; a silent half-dot just
 * degrades recall in production.
 */
export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSim: vector dim mismatch (got ${a.length}, expected ${b.length})`);
  }
  let s = 0;
  for (let i = 0; i < a.length; i += 1) {
    s += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return s;
}

/** Return a new L2-normalized copy of `v`. Zero-norm vectors return unchanged (the guard). */
export function l2Normalize(v: Float32Array): Float32Array {
  const dim = v.length;
  let norm = 0;
  for (let d = 0; d < dim; d += 1) {
    const x = v[d] ?? 0;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || ZERO_NORM_GUARD;
  const out = new Float32Array(dim);
  for (let d = 0; d < dim; d += 1) {
    out[d] = (v[d] ?? 0) / norm;
  }
  return out;
}

/** Component-wise mean of equal-dimension vectors (the centroid). Throws on empty input — silent
 *  zero-vector centroids hid bugs in similarity ranking before. Callers handle empty groups by
 *  not calling this. */
export function mean(vecs: readonly Float32Array[]): Float32Array {
  const first = vecs[0];
  if (first === undefined) {
    throw new Error("mean: empty vector list (caller must guard)");
  }
  const dim = first.length;
  const out = new Float32Array(dim);
  for (const v of vecs) {
    for (let d = 0; d < dim; d += 1) {
      out[d] = (out[d] ?? 0) + (v[d] ?? 0);
    }
  }
  for (let d = 0; d < dim; d += 1) {
    out[d] = (out[d] ?? 0) / vecs.length;
  }
  return out;
}

// ── Batch ops (flat-buffer JS loops) ────────────────────────────────────────
// The batch ops normalize every vector ONCE into a contiguous Float32Array, then take plain dot
// products (normalized → dot = cosine). The two helpers below keep the per-vector normalize and the
// dot product out of the doubly-nested public loops (readability + cognitive-complexity budget).

/** L2-normalize `v` into `out` starting at `base` (a row of `dim` floats). Zero-norm → all zeros. */
function normalizeInto(v: Float32Array, out: Float32Array, base: number, dim: number): void {
  let norm = 0;
  for (let d = 0; d < dim; d += 1) {
    const x = v[d] ?? 0;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || ZERO_NORM_GUARD;
  for (let d = 0; d < dim; d += 1) {
    out[base + d] = (v[d] ?? 0) / norm;
  }
}

/** Dot product of the two `dim`-length rows at `buf[baseA…]` and `buf[baseB…]` of one buffer. */
function dotRows(buf: Float32Array, baseA: number, baseB: number, dim: number): number {
  let s = 0;
  for (let d = 0; d < dim; d += 1) {
    s += (buf[baseA + d] ?? 0) * (buf[baseB + d] ?? 0);
  }
  return s;
}

/**
 * Cosine similarity of every pair of N vectors. Returns a FLAT N×N row-major Float32Array
 * (`result.sim[i * n + j]` = cos(vecs[i], vecs[j])).
 *
 * Inputs are L2-normalized defensively, so the math is `M · Mᵀ` where M is the normalized
 * matrix; symmetry halves the work (compute i≤j, mirror).
 *
 * Memory: returns N² float32s = 4·N² bytes. Fine for N up to ~5000 (≤ 100MB); above that, switch to
 * `cosineToMany` with caller-side row chunking.
 */
export function pairwiseCosine(vecs: readonly Float32Array[]): { sim: Float32Array; n: number } {
  const n = vecs.length;
  const first = vecs[0];
  if (first === undefined) {
    return { sim: new Float32Array(0), n: 0 };
  }
  const dim = first.length;
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i += 1) {
    const v = vecs[i];
    if (v !== undefined) {
      normalizeInto(v, flat, i * dim, dim);
    }
  }
  const sim = new Float32Array(n * n);
  for (let i = 0; i < n; i += 1) {
    sim[i * n + i] = 1;
    for (let j = i + 1; j < n; j += 1) {
      const cos = dotRows(flat, i * dim, j * dim, dim);
      sim[i * n + j] = cos;
      sim[j * n + i] = cos;
    }
  }
  return { sim, n };
}

/**
 * Cosine similarity of one `target` against each of `others`. Returns a Float32Array of length
 * `others.length` (`result[k]` = cos(target, others[k])).
 *
 * Meant for paths that fan one query out to many candidates (similarChats: chat centroid vs every
 * other chat centroid; future k-means assignment phase: each point vs every centroid).
 */
export function cosineToMany(target: Float32Array, others: readonly Float32Array[]): Float32Array {
  const k = others.length;
  if (k === 0) {
    return new Float32Array(0);
  }
  const dim = target.length;
  // Two-row scratch buffer: row 0 holds the normalized target (written once); row 1 (base `dim`) is
  // overwritten with each candidate's normalized copy before the dot — so both rows live in one
  // contiguous buffer and `dotRows` needs only a single buffer arg.
  const scratch = new Float32Array(dim + dim);
  normalizeInto(target, scratch, 0, dim);

  const out = new Float32Array(k);
  for (let i = 0; i < k; i += 1) {
    const v = others[i];
    if (v !== undefined) {
      normalizeInto(v, scratch, dim, dim);
      out[i] = dotRows(scratch, 0, dim, dim);
    }
  }
  return out;
}
