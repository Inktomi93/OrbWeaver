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

/** The sharp image adapter. `entry/` constructs it once and injects `transform` into
 *  `domain/assets`. Stateless (sharp holds no per-instance state) — the factory exists only to keep the
 *  injection seam uniform with the other infra handles. */
export interface ImageAdapter {
  /** Decode → auto-orient → optional resize → re-encode, stripping all metadata. Rejects non-images. */
  transform: (bytes: Uint8Array, opts?: ImageTransformOptions) => Promise<Uint8Array>;
  /** Decode just the header to report format + dimensions. Rejects (throws) on non-image bytes — the
   *  validation seam for an upload that must be a real raster image. */
  probe: (bytes: Uint8Array) => Promise<ImageInfo>;
}

const DEFAULT_FORMAT: ImageFormat = "webp";
const DEFAULT_QUALITY = 80;

function encode(pipeline: sharp.Sharp, format: ImageFormat, quality: number): sharp.Sharp {
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
      if (opts?.width !== undefined) {
        pipeline = pipeline.resize({ width: opts.width, withoutEnlargement: true });
      }
      const out = await encode(pipeline, format, quality).toBuffer();
      return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    },

    async probe(bytes): Promise<ImageInfo> {
      const meta = await sharp(bytes).metadata();
      if (meta.format === undefined || meta.width === undefined || meta.height === undefined) {
        throw new Error("image: not a decodable raster image");
      }
      return { format: meta.format, width: meta.width, height: meta.height };
    },
  };
}
