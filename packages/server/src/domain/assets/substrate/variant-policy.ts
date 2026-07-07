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

// The portrait (2:3, face-safe smart-crop) variant ladder — a SEPARATE fixed (w,h) ladder, not a
// width-only rung on `BLOB_WIDTHS`: the immersive VN/portrait avatar modes need a genuine crop (sharp
// `fit:'cover', position:'attention'`, `infra/image`), never a stretch or an aspect-preserving resize
// (`FINAL-Persona-and-Immersive-Chat-Visuals.md` §B.4). Same DoS-bounded-keyspace reasoning as
// `BLOB_WIDTHS` (esoterica #2) — a small fixed set, never a caller-chosen height.
// biome-ignore lint/style/noMagicNumbers: a fixed 2:3 display-size ladder; the literals are the data itself.
export const PORTRAIT_WIDTHS = [200, 400] as const;
const PORTRAIT_ASPECT_HEIGHT_OVER_WIDTH = 1.5; // 2:3 — height = width * 3/2

/** `snapPortraitWidth`'s resolved `(width, height)` pair — an inline type, not an exported interface
 *  (`types-in-contract` §7.4 reserves exported feature interfaces for `contract/`; this shape is only
 *  ever consumed via return-type inference by its one caller, `verbs/resolve-variant.ts`). */
function portraitSizeOf(width: number): { readonly width: number; readonly height: number } {
  return { width, height: Math.round(width * PORTRAIT_ASPECT_HEIGHT_OVER_WIDTH) };
}

/** Snap a requested portrait width to `PORTRAIT_WIDTHS`, returning the full `(width, height)` pair (2:3,
 *  derived — never a caller-supplied height, keeping the keyspace bounded like `snapBlobWidth`).
 *  `undefined` for a non-finite/non-positive request — the caller 404s it. */
export function snapPortraitWidth(
  requested: number,
): { readonly width: number; readonly height: number } | undefined {
  if (!Number.isFinite(requested) || requested <= 0) {
    return;
  }
  for (const width of PORTRAIT_WIDTHS) {
    if (width >= requested) {
      return portraitSizeOf(width);
    }
  }
  // Oversized ask → the top rung. The tuple is non-empty, so `.at(-1)` is always a number here.
  return portraitSizeOf(PORTRAIT_WIDTHS.at(-1) as number);
}
