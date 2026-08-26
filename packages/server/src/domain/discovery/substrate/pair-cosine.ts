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

/**
 * Hubs is index-aligned to vecs; pass all-zero hubs for a pure-cosine ranking. Returned pairs are unsorted.
 * The scan normalizes O(n·dim) input once, then streams the upper triangle without an n×n similarity buffer.
 * Optional bounds are production admission rails for callers that persist the result, not threshold knobs.
 */
export function pairsAboveThreshold(
  vecs: readonly Float32Array[],
  hubs: readonly number[],
  threshold: number,
  bounds: PairScanBounds = {},
): DuplicatePair[] {
  const n = vecs.length;
  if (bounds.maxVectors !== undefined && n > bounds.maxVectors) {
    throw new RangeError(`pair scan vector limit exceeded: ${n} > ${bounds.maxVectors}`);
  }
  if (n < 2) {
    return [];
  }
  const normalized = vecs.map(l2Normalize);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = normalized[i];
    if (a === undefined) {
      continue;
    }
    const hubI = hubs[i] ?? 0;
    for (let j = i + 1; j < n; j += 1) {
      const b = normalized[j];
      if (b === undefined) {
        continue;
      }
      // The old matrix stored each result in Float32Array; preserve that rounding while dropping the matrix.
      const similarity = Math.fround(cosineSim(a, b));
      if (similarity >= threshold) {
        if (bounds.maxPairs !== undefined && pairs.length >= bounds.maxPairs) {
          throw new RangeError(`pair scan output limit exceeded: more than ${bounds.maxPairs} pairs`);
        }
        pairs.push({
          i,
          j,
          similarity,
          cslsScore: 2 * similarity - hubI - (hubs[j] ?? 0),
        });
      }
    }
  }
  return pairs;
}
