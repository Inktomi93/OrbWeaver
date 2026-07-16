// domain/search/substrate/csls — the CSLS hub-adjust ranking math. Pure functions over floats; search-local
// (do not move to @orb/kit). csls = max(0, cosineDistance − 1 + hubScore); LOWER is closer/better. The
// clamp at 0 is demote-only (an anti-hub must never go negative and beat a genuinely closer match), so ties
// at the clamped floor break on raw distance, never array order.

/** Hub-score stand-in for a row with no hub_score computed yet; keeps it mid-scale, not artificially winning. */
export const NULL_HUB_FALLBACK = 0.5;

export function cslsAdjust(distance: number, hubScore: number | null): number {
  return Math.max(0, distance - 1 + (hubScore ?? NULL_HUB_FALLBACK));
}

/** Ascending comparator: primary = clamped adjusted score, secondary = raw cosine distance (tie-break). */
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
