// domain/search/substrate/csls — the CSLS hub-adjust ranking math (search.md §"CSLS hub-adjust ranking").
// PURE functions over floats; no I/O, no domain deps; search-local (they do NOT move to @orb/kit — search
// is the only caller; `discovery` hands its `hub_score` values to `embeddings.store`, it never calls these
// comparators — search.md movement table).
//
// CSLS (Cross-domain Similarity Local Scaling) penalizes "hub" vectors that sit close to EVERYTHING (a
// generic/blank embedding that would otherwise win every query). The adjusted score is a distance-like
// signal — LOWER is closer/better:
//
//     csls = cosineDistance − 1 + hubScore
//
// `hubScore` (the mean cosine of a row to its neighbours, written by `discovery`, read here) shifts a
// generic hub's score UP (worse). `NULL_HUB_FALLBACK` keeps freshly-embedded rows (no hub score computed
// yet) on the SAME scale as scored rows instead of treating them as zero-hub (which would make every new
// row artificially win).

/** The hub-score stand-in for a row whose `hub_score` has not been computed yet (NULL in the table). 0.5
 *  keeps unscored rows mid-scale alongside scored rows — search.md §"CSLS hub-adjust ranking". */
export const NULL_HUB_FALLBACK = 0.5;

/** The CSLS-adjusted retrieval score: `distance − 1 + hubScore` (LOWER = closer). `hubScore` null ⇒
 *  {@link NULL_HUB_FALLBACK}. */
export function cslsAdjust(distance: number, hubScore: number | null): number {
  return distance - 1 + (hubScore ?? NULL_HUB_FALLBACK);
}

/** Ascending comparator over a raw CSLS score (LOWER first = closer first). */
export function compareCsls(a: number, b: number): number {
  return a - b;
}

/** Comparator factory: order a list of `T` ascending by its extracted CSLS score (LOWER first). Keeps the
 *  ranking direction in ONE place so no call site re-spells the sort sign. */
export function compareCslsBy<T>(score: (item: T) => number): (a: T, b: T) => number {
  return (a, b) => compareCsls(score(a), score(b));
}

/** The rerank budget cap: take the top `cap` CSLS-ranked candidates to hand the (expensive) cross-encoder.
 *  Caller passes an ALREADY CSLS-sorted list; this trims it to the rerank budget (`RERANK_POOL_FACTOR ×
 *  topN`). A non-positive `cap` yields an empty pool. */
export function rerankPoolByScores<T>(sortedByCsls: readonly T[], cap: number): T[] {
  if (cap <= 0) {
    return [];
  }
  return sortedByCsls.slice(0, cap);
}
