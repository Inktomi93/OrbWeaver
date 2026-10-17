// Image normalization contracts stay with the sealed adapter and contain no sharp implementation types.

/** Container formats accepted by the image adapter. */
export const IMAGE_FORMATS = ["webp", "png", "jpeg"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Options for {@link ImageAdapter.transform}. `width` is OPTIONAL: omit it to normalize/strip metadata
 *  without resizing (e.g. sanitizing an uploaded original); supply an already-snapped width to produce a
 *  variant. `format` defaults to webp; `quality` applies to the lossy encoders (webp/jpeg). */
export interface ImageTransformOptions {
  /** Target width in px (already snapped to the domain's ladder). Omitted ⇒ no resize. Never enlarges. */
  width?: number;
  /** Target height in px — PAIRS with `width` for a fixed-box crop (the 2:3 portrait / 3:1 banner
   *  variants, `domain/assets/substrate/variant-policy` `PORTRAIT_WIDTHS`/`BANNER_WIDTHS`). Omitted
   *  (width-only) ⇒ the existing aspect-preserving resize (the plain `icon` ladder). */
  height?: number;
  /** Resize fit mode — only meaningful when `height` is also given (sharp's `fit` requires both
   *  dimensions). `'cover'` crops to fill the box; the portrait/banner variants are the only callers. */
  fit?: "cover";
  /** Crop anchor — only meaningful with `fit:'cover'`. `'attention'` is sharp's SALIENCY/smart-crop
   *  strategy (libvips edge+skin-tone detection), never `'centre'`: avatars are face-centric and a naive
   *  center-crop decapitates a portrait source (§B.4 — this is the documented reason the portrait variant
   *  exists at all, not a stylistic choice). */
  position?: "attention";
  format?: ImageFormat;
  /** Lossy-encoder quality 1–100 (webp/jpeg). */
  quality?: number;
}

/** Decoded image dimensions/format — the return of {@link ImageAdapter.probe}. */
export interface ImageInfo {
  /** The detected container format (e.g. `"png"`, `"jpeg"`, `"webp"`). */
  format: string;
  /** Decoded pixel width. */
  width: number;
  /** Decoded pixel height. */
  height: number;
}

/** The sharp image adapter. `entry/` constructs it once and injects `transform` into
 *  `domain/assets`. Stateless (sharp holds no per-instance state) — the factory exists only to keep the
 *  injection seam uniform with the other infra handles. */
export interface ImageAdapter {
  frameCount: (bytes: Uint8Array) => Promise<number>;
  /** Decode → auto-orient → optional resize → re-encode, stripping all metadata. Rejects non-images. */
  transform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** Decode just the header to report format + dimensions. Rejects (throws) on non-image bytes — the
   *  validation seam for an upload that must be a real raster image. */
  probe: (bytes: Uint8Array) => Promise<ImageInfo>;
}
