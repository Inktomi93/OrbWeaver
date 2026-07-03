// domain/discovery/substrate/hub-math — the CSLS hubness math (pure; zero I/O). The hub score of a vector is
// the MEAN cosine to its K nearest SAME-TYPE neighbours (CSLS_K = 10): a generic/blank vector that sits close
// to EVERYTHING scores high (≈1) and is demoted by `search`'s CSLS rerank; a distinctive vector scores low.
// (Was neo-tavern `corpus/verbs/hubness.ts`'s `computeGroupHubs`/`offer`; the WRITE moved to the injected
// `embeddings.writeHubScores` seam — this file is the compute only.)
//
// ESOTERIC #1 (load-bearing): the dense path materializes the N×N similarity matrix
// (`@orb/kit/vector-math.pairwiseCosine`, 4·N² bytes ≈ 100MB at N=5000); ABOVE `HUBNESS_DENSE_MAX` it must
// NOT materialize the square — it streams row-by-row via `cosineToMany` (one 1×N row, O(N) memory), folding
// each into the top-K. The two paths are BIT-FOR-BIT identical (same normalized dot products, same top-K
// selection) — a fixture asserts it. Drop the streaming branch and a large corpus OOMs the `csls` workload.

import { cosineToMany, pairwiseCosine } from "@orb/kit/vector-math";

/** The CSLS neighbour count — the K nearest same-type vectors whose cosine is averaged into a hub score. */
export const CSLS_K = 10;

/** The dense-vs-streaming switch (≈100MB N×N float32 matrix at N=5000). At/above this N the hub pass streams
 *  per-row instead of materializing the square (esoteric #1). */
export const HUBNESS_DENSE_MAX = 5000;

/** Fold one cosine value into a bounded top-`k` accumulator kept ascending (`top[0]` = the current min). A
 *  full sort per offer is O(k log k) — negligible at k=10 — and keeps both code paths trivially identical. */
function offer(top: number[], value: number, k: number): void {
  if (top.length < k) {
    top.push(value);
    top.sort((a, b) => a - b);
    return;
  }
  // Replace the smallest kept value iff this one beats it (a non-empty `top` always has index 0 here).
  const min = top[0] ?? Number.NEGATIVE_INFINITY;
  if (value > min) {
    top[0] = value;
    top.sort((a, b) => a - b);
  }
}

/** Mean of a non-empty number list; 0 for an empty list (a lone vector with no neighbours ⇒ hub 0). */
function meanOf(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const v of values) {
    sum += v;
  }
  return sum / values.length;
}

/** The top-`k` mean of one similarity row of length `n`, excluding index `skip` (self). Shared by the dense
 *  and streaming branches so both produce bit-identical hub scores. `at(j)` reads the j-th cosine. */
function topKMean(at: (j: number) => number, n: number, skip: number, k: number): number {
  const top: number[] = [];
  for (let j = 0; j < n; j += 1) {
    if (j !== skip) {
      offer(top, at(j), k);
    }
  }
  return meanOf(top);
}

/**
 * The hub score of each of `vecs` — the mean cosine to its `k` nearest OTHER vectors (self excluded). Returns
 * an array index-aligned to `vecs`. A group of fewer than 2 vectors yields all-zero (no neighbours).
 *
 * `denseMax` selects the materialization strategy (esoteric #1) — default {@link HUBNESS_DENSE_MAX}; pass a
 * small value to force the streaming branch (the two paths are bit-identical, so a fixture can prove it).
 */
export function computeGroupHubs(
  vecs: readonly Float32Array[],
  opts: { readonly k?: number | undefined; readonly denseMax?: number | undefined } = {},
): number[] {
  const n = vecs.length;
  const k = opts.k ?? CSLS_K;
  const denseMax = opts.denseMax ?? HUBNESS_DENSE_MAX;
  if (n < 2) {
    return new Array<number>(n).fill(0);
  }
  return n <= denseMax ? denseHubs(vecs, n, k) : streamingHubs(vecs, n, k);
}

/** Dense path: one N×N `pairwiseCosine` pass; row i's top-K mean over the off-diagonal (esoteric #1). */
function denseHubs(vecs: readonly Float32Array[], n: number, k: number): number[] {
  const { sim } = pairwiseCosine(vecs);
  const hubs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const base = i * n;
    hubs[i] = topKMean((j) => sim[base + j] ?? 0, n, i, k);
  }
  return hubs;
}

/** Streaming path: recompute row i on demand (1×N `cosineToMany`); O(N) memory (esoteric #1). Bit-identical
 *  to {@link denseHubs} — same normalized dot products, same top-K selection. */
function streamingHubs(vecs: readonly Float32Array[], n: number, k: number): number[] {
  const hubs = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    const target = vecs[i];
    if (target === undefined) {
      hubs[i] = 0;
      continue;
    }
    const row = cosineToMany(target, vecs);
    hubs[i] = topKMean((j) => row[j] ?? 0, n, i, k);
  }
  return hubs;
}
