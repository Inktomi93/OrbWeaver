// domain/discovery/substrate/pair-cosine — all-pairs near-duplicate detection (pure; zero I/O). Returns
// every vector pair whose raw cosine clears a threshold, each carrying its CSLS-adjusted rank key. All-pairs
// analytics, not top-k retrieval (that's search via vector_distance_cos).
//
// csls(a,b) = 2·cos(a,b) − hub(a) − hub(b): deflates two generic (high-hub) cards below two distinctive
// cards at the same raw cosine. Threshold gates on raw cosine; cslsScore only ranks.

import { cosineSim, l2Normalize } from "@orb/kit/vector-math";

interface DuplicatePair {
  readonly i: number;
  readonly j: number;
  readonly similarity: number;
  readonly cslsScore: number;
}

interface PairScanBounds {
  readonly maxVectors?: number;
  readonly maxPairs?: number;
}

interface PairScanState {
  readonly normalized: readonly Float32Array[];
  readonly hubs: readonly number[];
  readonly threshold: number;
  readonly maxPairs: number | undefined;
  readonly pairs: DuplicatePair[];
}

function appendIfAboveThreshold(state: PairScanState, i: number, j: number): void {
  const a = state.normalized[i];
  const b = state.normalized[j];
  if (a === undefined || b === undefined) {
    return;
  }
  // The old matrix stored each result in Float32Array; preserve that rounding while dropping the matrix.
  const similarity = Math.fround(cosineSim(a, b));
  if (similarity < state.threshold) {
    return;
  }
  if (state.maxPairs !== undefined && state.pairs.length >= state.maxPairs) {
    throw new RangeError(`pair scan output limit exceeded: more than ${state.maxPairs} pairs`);
  }
  state.pairs.push({
    i,
    j,
    similarity,
    cslsScore: 2 * similarity - (state.hubs[i] ?? 0) - (state.hubs[j] ?? 0),
  });
}

/**
 * Hubs is index-aligned to vecs; pass all-zero hubs for a pure-cosine ranking. Returned pairs are unsorted.
 * The scan normalizes O(n·dim) input once, then streams the upper triangle without an n×n similarity buffer.
 * Optional bounds are production admission rails for callers that persist the result, not threshold knobs.
 */
export function pairsAboveThreshold(vecs: readonly Float32Array[], hubs: readonly number[], threshold: number, bounds: PairScanBounds = {}): DuplicatePair[] {
  const n = vecs.length;
  if (bounds.maxVectors !== undefined && n > bounds.maxVectors) {
    throw new RangeError(`pair scan vector limit exceeded: ${n} > ${bounds.maxVectors}`);
  }
  if (n < 2) {
    return [];
  }
  const normalized = vecs.map(l2Normalize);
  const pairs: DuplicatePair[] = [];
  const state: PairScanState = { normalized, hubs, threshold, maxPairs: bounds.maxPairs, pairs };
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      appendIfAboveThreshold(state, i, j);
    }
  }
  return pairs;
}
