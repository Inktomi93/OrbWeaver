// domain/discovery/substrate/pair-cosine — all-pairs near-duplicate detection (pure; zero I/O). Returns
// every vector pair whose raw cosine clears a threshold, each carrying its CSLS-adjusted rank key. All-pairs
// analytics, not top-k retrieval (that's search via vector_distance_cos).
//
// csls(a,b) = 2·cos(a,b) − hub(a) − hub(b): deflates two generic (high-hub) cards below two distinctive
// cards at the same raw cosine. Threshold gates on raw cosine; cslsScore only ranks.

import { pairwiseCosine } from "@orb/kit/vector-math";

interface DuplicatePair {
  readonly i: number;
  readonly j: number;
  readonly similarity: number;
  readonly cslsScore: number;
}

/** hubs is index-aligned to vecs; pass all-zero hubs for a pure-cosine ranking. Returned pairs are unsorted. */
export function pairsAboveThreshold(vecs: readonly Float32Array[], hubs: readonly number[], threshold: number): DuplicatePair[] {
  const n = vecs.length;
  if (n < 2) {
    return [];
  }
  const { sim } = pairwiseCosine(vecs);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < n; i += 1) {
    const base = i * n;
    const hubI = hubs[i] ?? 0;
    for (let j = i + 1; j < n; j += 1) {
      const similarity = sim[base + j] ?? 0;
      if (similarity >= threshold) {
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
