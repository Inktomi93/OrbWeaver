// infra/image — the sharp adapter (D6). A SEALED CPU/I/O executor: decode → auto-orient → optional
// resize → re-encode, behind an `imageTransform` op. Imports ONLY `sharp` + node types — NEVER @orb/db,
// a domain, transport, or entry (`infra-no-db` / `infra-below-domain`). The width-snap (`snapBlobWidth`
// over `BLOB_WIDTHS`) is DOMAIN policy (`domain/assets/substrate/variant-policy`); this adapter receives
// an already-snapped width. `domain/assets/verbs/resolve-variant` injects `transform` (snap → cache-read →
// transform → cache-put); the blob route never touches sharp directly.
//
// SECURITY / PRIVACY:
//   • Strips ALL metadata. sharp does NOT copy input metadata to the output unless `keepMetadata()` /
//     `withMetadata()` is called — which this adapter never does — so EXIF (incl. GPS), XMP, and ICC are
//     dropped on every transform. `.rotate()` (no args) bakes in the EXIF orientation BEFORE the metadata
//     is discarded, so the visual orientation survives while the data does not.
//   • Rejects non-images. `probe` / `transform` decode through sharp, which throws on bytes it cannot
//     parse as a supported raster image — the validation seam the assets domain can lean on. (The upload
//     boundary's claimed-mime-vs-signature check is a SEPARATE pure guard in `domain/assets` `sniffMime`.)
//   • The default sharp `limitInputPixels` (~268 MP) guards against decompression-bomb inputs.

import { floodMatte } from "@orb/server/kit/image-matte";
import type { Sharp } from "sharp";
import sharp from "sharp";

/** The output container formats this adapter can normalize to. `webp` is the only one the client ever
 *  requests (the `avatarUrl` ladder hardcodes `f=webp`); `png`/`jpeg` round out the normalizer. The union
 *  (`ImageFormat`) is DERIVED from this tuple and kept file-local — `no-inline-types` reserves exported
 *  `type` aliases for `contract/`, so the canonical infra home is this runtime `as const` tuple. */
export const IMAGE_FORMATS = ["webp", "png", "jpeg"] as const;

type ImageFormat = (typeof IMAGE_FORMATS)[number];

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
  /** Output container. Defaults to {@link DEFAULT_FORMAT} (webp). */
  format?: ImageFormat;
  /** Lossy-encoder quality 1–100 (webp/jpeg). Defaults to {@link DEFAULT_QUALITY}. */
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

/** A row-major cell grid over a sprite sheet — `cols × rows` equal cells (expressions-design/03 §3.1). */
export interface SpriteGridOptions {
  readonly cols: number;
  readonly rows: number;
}

/** The sharp image adapter. `entry/` constructs it once and injects `transform` into
 *  `domain/assets`. Stateless (sharp holds no per-instance state) — the factory exists only to keep the
 *  injection seam uniform with the other infra handles. */
export interface ImageAdapter {
  /** Decode → auto-orient → optional resize → re-encode, stripping all metadata. Rejects non-images. */
  transform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** Decode just the header to report format + dimensions. Rejects (throws) on non-image bytes — the
   *  validation seam for an upload that must be a real raster image. */
  probe: (bytes: Uint8Array) => Promise<ImageInfo>;
  /** Slice a grid sprite sheet into row-major PNG cells (expressions-design/03 §3.1). Each cell is
   *  `floor(w/cols) × floor(h/rows)`, extracted left-to-right then top-to-bottom (cell `i` binds to
   *  `labels[i]`). Returns exactly `cols*rows` cells; the sheet's right/bottom remainder (from the floor) is
   *  dropped. Rejects non-images. */
  sliceGrid: (bytes: Uint8Array, opts: SpriteGridOptions) => Promise<readonly Uint8Array[]>;
  /** Corner-sampled flood-fill matte → transparent PNG (expressions-design/03 §4.2). Deterministic, no ML —
   *  the zero-setup matte fallback. Decodes to raw RGBA, floods the background to alpha-0
   *  (`@orb/server/kit/image-matte`), re-encodes PNG. Rejects non-images. */
  matteFlood: (bytes: Uint8Array, opts: { tolerance: number }) => Promise<Uint8Array>;
}

const DEFAULT_FORMAT: ImageFormat = "webp";
const DEFAULT_QUALITY = 80;

/** RGBA byte stride — the channel count sharp emits after `.ensureAlpha()`. */
const RGBA_CHANNELS = 4;

/** Re-view a node Buffer as a Uint8Array over the exact same bytes (no copy). */
function asBytes(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function encode(pipeline: Sharp, format: ImageFormat, quality: number): Sharp {
  switch (format) {
    case "webp":
      return pipeline.webp({ quality });
    case "jpeg":
      return pipeline.jpeg({ quality });
    case "png":
      return pipeline.png();
    default: {
      const exhaustive: never = format;
      throw new Error(`image: unsupported format ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function createImageAdapter(): ImageAdapter {
  return {
    async transform(bytes, opts): Promise<Uint8Array> {
      const format = opts?.format ?? DEFAULT_FORMAT;
      const quality = opts?.quality ?? DEFAULT_QUALITY;
      // `.rotate()` with no args applies the EXIF orientation, then the metadata is dropped (sharp does
      // not carry it forward unless asked) — visual orientation kept, EXIF/GPS/XMP stripped.
      let pipeline = sharp(bytes).rotate();
      if (opts?.width !== undefined && opts.height !== undefined) {
        // The fixed-box crop path (portrait variant): fit/position only apply together with both dims.
        pipeline = pipeline.resize({
          width: opts.width,
          height: opts.height,
          fit: opts.fit ?? "cover",
          position: opts.position ?? "attention",
          withoutEnlargement: true,
        });
      } else if (opts?.width !== undefined) {
        pipeline = pipeline.resize({ width: opts.width, withoutEnlargement: true });
      }
      const out = await encode(pipeline, format, quality).toBuffer();
      return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    },

    async probe(bytes): Promise<ImageInfo> {
      // sharp's `Metadata.format`/`width`/`height` are non-optional: metadata() only resolves for bytes
      // it successfully decoded (it throws otherwise), so these are always populated at this point.
      const meta = await sharp(bytes).metadata();
      return { format: meta.format, width: meta.width, height: meta.height };
    },

    async sliceGrid(bytes, { cols, rows }): Promise<readonly Uint8Array[]> {
      const meta = await sharp(bytes).metadata();
      const cellW = Math.floor(meta.width / cols);
      const cellH = Math.floor(meta.height / rows);
      // Row-major (reading order): top-to-bottom, left-to-right — cell i binds to labels[i] (§3.1). Build the
      // region list first, then extract in parallel (a fresh sharp per cell — pipelines are single-use);
      // `Promise.all` preserves the row-major order.
      const regions: { readonly left: number; readonly top: number }[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          regions.push({ left: col * cellW, top: row * cellH });
        }
      }
      return await Promise.all(
        regions.map(async ({ left, top }) => {
          const cell = await sharp(bytes).extract({ left, top, width: cellW, height: cellH }).png().toBuffer();
          return asBytes(cell);
        }),
      );
    },

    async matteFlood(bytes, { tolerance }): Promise<Uint8Array> {
      // Decode to raw RGBA (alpha forced on) → pure corner-flood → re-encode PNG. `.rotate()` bakes EXIF
      // orientation first (a generated sheet has none, but the normalizer stays consistent with transform()).
      const { data, info } = await sharp(bytes).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const matted = floodMatte(asBytes(data), { width: info.width, height: info.height, tolerance });
      const out = await sharp(matted, { raw: { width: info.width, height: info.height, channels: RGBA_CHANNELS } })
        .png()
        .toBuffer();
      return asBytes(out);
    },
  };
}
