// domain/search/substrate/csls — the CSLS hub-adjust ranking math. Pure functions over floats; search-local
// (do not move to @orb/kit). csls = max(0, cosineDistance − 1 + hubScore); LOWER is closer/better. The
// clamp at 0 is demote-only (an anti-hub must never go negative and beat a genuinely closer match), so ties
// at the clamped floor break on raw distance, never array order.

/** Hub-score stand-in for a row with no hub_score computed yet; keeps it mid-scale, not artificially winning.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const NULL_HUB_FALLBACK = 0.5;

export function cslsAdjust(distance: number, hubScore: number | null): number {
  return Math.max(0, distance - 1 + (hubScore ?? NULL_HUB_FALLBACK));
}

/**
 * THE ONE READOUT SEAM (corpus forensics 2026-08-18 §3, R2b). Cosine SIMILARITY for a reader —
 * `1 − distance`, clamped to [0,1]; HIGHER is closer, which is the universal convention any rendered
 * "score" column is read by.
 *
 * WHY A SECOND NUMBER RATHER THAN A DIFFERENT `score`. {@link cslsAdjust} is a clamped DISTANCE and stays
 * the ranking signal — but as a rendered figure it was anti-informative: with no hub_score computed anywhere,
 * every hit closer than distance 0.5 collapses to exactly 0, so all four relevant queries measured on the
 * live library rendered `0.00` down the column while a nonsense query rendered 0.02–0.07. This is the ONLY
 * function a surface may render; `score` never reaches a reader.
 *
 * IT IS A READOUT CHANGE, NOT A RANKING CHANGE, and the arithmetic is the receipt: with `hubScore` null the
 * adjusted score is `max(0, d − 0.5)`, which is monotone non-decreasing in `d` and ties at the floor break on
 * raw `d` ({@link compareCsls}) — so a hub-less library ranks IDENTICALLY either way. Order stays CSLS so a
 * hub-inflated row cannot win the list back; the number beside it is hub-free by construction, which is also
 * why a missing hub_score is never fabricated into what the reader sees.
 */
export function relevanceOf(distance: number): number {
  return Math.min(1, Math.max(0, 1 - distance));
}

/** Ascending comparator: primary = clamped adjusted score, secondary = raw cosine distance (tie-break).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function compareCsls(a: { readonly dist: number; readonly hub: number | null }, b: { readonly dist: number; readonly hub: number | null }): number {
  const adj = cslsAdjust(a.dist, a.hub) - cslsAdjust(b.dist, b.hub);
  return adj !== 0 ? adj : a.dist - b.dist;
}

/** {@link compareCsls} lifted over arbitrary row shapes via dist/hub accessors. */
export function compareCslsBy<T>(distOf: (item: T) => number, hubOf: (item: T) => number | null): (a: T, b: T) => number {
  return (a, b) => compareCsls({ dist: distOf(a), hub: hubOf(a) }, { dist: distOf(b), hub: hubOf(b) });
}

/** Trim an already CSLS-sorted list to the rerank budget; a non-positive cap yields an empty pool. */
export function rerankPoolByScores<T>(sortedByCsls: readonly T[], cap: number): T[] {
  if (cap <= 0) {
    return [];
  }
  return sortedByCsls.slice(0, cap);
}
