// domain/discovery/substrate/pair-cosine — all-pairs near-duplicate detection (pure; zero I/O). Returns every
// vector pair whose RAW cosine clears a threshold, each carrying its CSLS-adjusted rank key. Used ONLY by the
// near-duplicate + similarity-graph features (discovery concerns) — it is all-pairs ANALYTICS, NOT top-k
// retrieval (that is `search`, via `vector_distance_cos` — the two-cosine-access-patterns rule). Was
// neo-tavern `corpus/substrate/pair-cosine.ts`; its `normalizeFlat` is DELETED (→ @orb/kit/vector-math's one
// `l2Normalize`, used inside `pairwiseCosine`), and the all-pairs scan now reuses `pairwiseCosine`.
//
// CSLS rank key (esoteric: "CSLS-ranked"): `csls(a,b) = 2·cos(a,b) − hub(a) − hub(b)`. A pair of two GENERIC
// (high-hub) cards — each close to everything — is deflated below a pair of two DISTINCTIVE cards at the same
// raw cosine, so the ranking surfaces "these two are uniquely alike", not "both are bland". The THRESHOLD
// gates on RAW cosine (a genuine near-dup must clear it regardless of hubness); `cslsScore` only RANKS.

import { pairwiseCosine } from "@orb/kit/vector-math";

// One above-threshold pair: the two INDICES into the input arrays + the raw cosine + the CSLS rank key.
// File-local (no exported persistence/contract type — consumers infer it from the function return; the
// no-inline-types gate flags only EXPORTED type leaks, mirroring search/persistence/nearest.ts).
interface DuplicatePair {
  readonly i: number;
  readonly j: number;
  readonly similarity: number;
  readonly cslsScore: number;
}

/**
 * Every pair `(i, j)` with `i < j` whose raw cosine ≥ `threshold`, each scored by the CSLS rank key
 * (`2·sim − hub_i − hub_j`). `hubs` is index-aligned to `vecs` (a vector's mean cosine to its K nearest
 * neighbours — `hub-math.computeGroupHubs`); pass all-zero hubs for a pure-cosine ranking. The returned
 * pairs are NOT sorted — the caller ranks (the recompute orders by `cslsScore` desc). Empty input ⇒ `[]`.
 */
export function pairsAboveThreshold(
  vecs: readonly Float32Array[],
  hubs: readonly number[],
  threshold: number,
): DuplicatePair[] {
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
