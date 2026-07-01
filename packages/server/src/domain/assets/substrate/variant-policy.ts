// domain/assets/substrate/variant-policy — the variant-sizing POLICY (pure). This is DOMAIN policy, not a
// kit primitive (per Legacy-Migration-and-Gaps.md §5): only the server's blob route snaps (the client has its own
// `AVATAR_SIZES` ladder), so there's no cross-boundary consumer — it stays domain-internal.
//
// BLOB_WIDTHS is a FIXED ladder for two load-bearing reasons (esoterica #2 — a DoS defense, not a nicety):
//   1. Every cached variant is reusable across call sites that snap to the same rung (`?w=90` and `?w=96`
//      share one cached webp).
//   2. An attacker walking `?w=1..10000` can't mint unbounded distinct variants on disk — the per-hash
//      keyspace is |BLOB_WIDTHS|, not 2^31. `resolveVariant` 404s anything `snapBlobWidth` rejects.

// The transform widths the blob route produces — ascending, 2× the client's avatar ladder (HiDPI). A
// fixed DATA ladder: each rung IS its meaningful value, so extracting six `WIDTH_48`-style aliases would
// only restate them — the array is the one home.
// biome-ignore lint/style/noMagicNumbers: a fixed display-width ladder; the literals are the data itself.
export const BLOB_WIDTHS = [48, 64, 96, 128, 240, 400] as const;

/** Snap a requested transform width to the ladder: the smallest rung ≥ the request (crisp at the asked
 *  size), or the top rung for oversized asks. `undefined` = not a usable width (non-finite or ≤ 0) — the
 *  caller 404s it, keeping the keyspace bounded. */
export function snapBlobWidth(requested: number): number | undefined {
  if (!Number.isFinite(requested) || requested <= 0) {
    return;
  }
  for (const width of BLOB_WIDTHS) {
    if (width >= requested) {
      return width;
    }
  }
  // Oversized ask → the top rung. The tuple is non-empty, so `.at(-1)` is always a number here.
  return BLOB_WIDTHS.at(-1);
}
