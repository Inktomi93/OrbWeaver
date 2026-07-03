// domain/search/substrate/csls — the CSLS hub-adjust ranking math.
// PURE functions over floats; no I/O, no domain deps; search-local (they do NOT move to @orb/kit — search
// is the only caller; `discovery` hands its `hub_score` values to `embeddings.store`, it never calls these
// comparators).
//
// CSLS (Cross-domain Similarity Local Scaling) penalizes "hub" vectors that sit close to EVERYTHING (a
// generic/blank embedding that would otherwise win every query). The adjusted score is a distance-like
// signal — LOWER is closer/better:
//
//     csls = max(0, cosineDistance − 1 + hubScore)
//
// `hubScore` (the mean cosine of a row to its neighbours, written by `discovery`, read here) shifts a
// generic hub's score UP (worse). The CLAMP at 0 is load-bearing (the neo invariant the first port
// dropped): CSLS only DEMOTES — without it an anti-hub row (low hubScore) would go NEGATIVE and beat a
// genuinely closer match (hubness would PROMOTE, not just demote). The clamp collapses every candidate
// with `cos ≥ hub` to a flat 0, so the COMPARATOR must break ties on the raw distance — otherwise ties
// defer to array-concat order (entity type, not similarity), burying closer matches. `NULL_HUB_FALLBACK`
// keeps freshly-embedded rows (no hub score computed yet) on the SAME scale as scored rows instead of
// treating them as zero-hub (which would make every new row artificially win).

/** The hub-score stand-in for a row whose `hub_score` has not been computed yet (NULL in the table). 0.5
 *  keeps unscored rows mid-scale alongside scored rows (see the file header). */
export const NULL_HUB_FALLBACK = 0.5;

/** The CSLS-adjusted retrieval score: `max(0, distance − 1 + hubScore)` (LOWER = closer; the clamp is
 *  demote-only — see the file header). `hubScore` null ⇒ {@link NULL_HUB_FALLBACK}. */
export function cslsAdjust(distance: number, hubScore: number | null): number {
  return Math.max(0, distance - 1 + (hubScore ?? NULL_HUB_FALLBACK));
}

/** Ascending comparator over CSLS candidates: primary = the CLAMPED adjusted score, SECONDARY = the raw
 *  cosine distance. The tie-break matters because the clamp collapses every `cos ≥ hub` candidate to a
 *  flat 0 (see the file header). Both keys sit on the cosine scale, so null-hub and scored rows compare
 *  correctly. */
export function compareCsls(
  a: { readonly dist: number; readonly hub: number | null },
  b: { readonly dist: number; readonly hub: number | null },
): number {
  const adj = cslsAdjust(a.dist, a.hub) - cslsAdjust(b.dist, b.hub);
  return adj !== 0 ? adj : a.dist - b.dist;
}

/** {@link compareCsls} lifted over arbitrary row shapes via `dist`/`hub` accessors. Keeps the ranking
 *  direction + the tie-break in ONE place so no call site re-spells the sort. */
export function compareCslsBy<T>(
  distOf: (item: T) => number,
  hubOf: (item: T) => number | null,
): (a: T, b: T) => number {
  return (a, b) =>
    compareCsls({ dist: distOf(a), hub: hubOf(a) }, { dist: distOf(b), hub: hubOf(b) });
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
