// The variant-sizing POLICY (pure, domain-internal). Each ladder is FIXED: it bounds the per-hash variant
// keyspace so an attacker walking `?w=1..10000` can't mint unbounded distinct variants on disk, and every
// cache reusable across call sites that snap to the same rung. `resolveVariant` 404s anything a snap* rejects.

// biome-ignore lint/style/noMagicNumbers: a fixed display-width ladder; the literals are the data itself.
export const BLOB_WIDTHS = [48, 64, 96, 128, 240, 400] as const;

/** Smallest rung ≥ the request, or the top rung for oversized asks; `undefined` for a non-finite/≤0 request. */
export function snapBlobWidth(requested: number): number | undefined {
  if (!Number.isFinite(requested) || requested <= 0) {
    return;
  }
  for (const width of BLOB_WIDTHS) {
    if (width >= requested) {
      return width;
    }
  }
  // Oversized ask → the top rung; the tuple is non-empty so `.at(-1)` is always a number here.
  return BLOB_WIDTHS.at(-1);
}

// The portrait (2:3, face-safe smart-crop) ladder — a separate fixed (w,h) set, never a caller-chosen height.
// biome-ignore lint/style/noMagicNumbers: a fixed 2:3 display-size ladder; the literals are the data itself.
const PORTRAIT_WIDTHS = [200, 400] as const;
const PORTRAIT_ASPECT_HEIGHT_OVER_WIDTH = 1.5; // 2:3 — height = width * 3/2

/** Kept module-private (not exported) — consumed only via return-type inference. */
function portraitSizeOf(width: number): { readonly width: number; readonly height: number } {
  return { width, height: Math.round(width * PORTRAIT_ASPECT_HEIGHT_OVER_WIDTH) };
}

/** Snap a requested portrait width to `PORTRAIT_WIDTHS`, returning the full derived `(width, height)` pair. */
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
  // Oversized ask → the top rung; the tuple is non-empty so `.at(-1)` is always a number here.
  return portraitSizeOf(PORTRAIT_WIDTHS.at(-1) as number);
}

// The banner (3:1, face-safe smart-crop) ladder — a wide, fixed-aspect crop, never a caller-chosen height.
// biome-ignore lint/style/noMagicNumbers: a fixed 3:1 display-size ladder; the literals are the data itself.
export const BANNER_WIDTHS = [480, 800] as const;
// biome-ignore lint/style/noMagicNumbers: the 3:1 ratio IS the data (mirrors PORTRAIT_ASPECT_HEIGHT_OVER_WIDTH).
const BANNER_ASPECT_HEIGHT_OVER_WIDTH = 1 / 3; // 3:1 — height = width / 3

function bannerSizeOf(width: number): { readonly width: number; readonly height: number } {
  return { width, height: Math.round(width * BANNER_ASPECT_HEIGHT_OVER_WIDTH) };
}

/** Snap a requested banner width to `BANNER_WIDTHS` — same shape as {@link snapPortraitWidth}. */
export function snapBannerWidth(
  requested: number,
): { readonly width: number; readonly height: number } | undefined {
  if (!Number.isFinite(requested) || requested <= 0) {
    return;
  }
  for (const width of BANNER_WIDTHS) {
    if (width >= requested) {
      return bannerSizeOf(width);
    }
  }
  // Oversized ask → the top rung; the tuple is non-empty so `.at(-1)` is always a number here.
  return bannerSizeOf(BANNER_WIDTHS.at(-1) as number);
}
