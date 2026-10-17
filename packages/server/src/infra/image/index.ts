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

import type { Sharp } from "sharp";
import sharp from "sharp";

import type { ImageAdapter, ImageFormat, ImageInfo } from "./contract.ts";

export type { ImageAdapter, ImageInfo, ImageTransformOptions } from "./contract.ts";
export { IMAGE_FORMATS } from "./contract.ts";

const DEFAULT_FORMAT: ImageFormat = "webp";
const DEFAULT_QUALITY = 80;
const TURNED_ORIENTATION = 5;

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

// The crop box scaled down (never up) until it fits inside the oriented source, aspect kept.
async function fitBoxToSource(bytes: Uint8Array, width: number, height: number): Promise<{ readonly width: number; readonly height: number }> {
  const meta = await sharp(bytes).metadata();
  // EXIF orientations 5-8 turn the image a quarter, which swaps the dimensions `.rotate()` will produce.
  const turned = (meta.orientation ?? 1) >= TURNED_ORIENTATION;
  const sourceWidth = turned ? meta.height : meta.width;
  const sourceHeight = turned ? meta.width : meta.height;
  const scale = Math.min(1, sourceWidth / width, sourceHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function createImageAdapter(): ImageAdapter {
  return {
    async frameCount(bytes): Promise<number> {
      return (await sharp(bytes).metadata()).pages ?? 1;
    },
    async transform(bytes, opts): Promise<Uint8Array> {
      const format = opts?.format ?? DEFAULT_FORMAT;
      const quality = opts?.quality ?? DEFAULT_QUALITY;
      // `.rotate()` with no args applies the EXIF orientation, then the metadata is dropped (sharp does
      // not carry it forward unless asked) — visual orientation kept, EXIF/GPS/XMP stripped.
      let pipeline = sharp(bytes).rotate();
      if (opts?.width !== undefined && opts.height !== undefined) {
        // The fixed-box crop path (portrait variant): fit/position only apply together with both dims.
        // Never enlarge, but keep the crop: a box bigger than the source shrinks to fit it at the same aspect.
        // (`withoutEnlargement` alone returns the uncropped source when either side is too small.)
        const box = await fitBoxToSource(bytes, opts.width, opts.height);
        pipeline = pipeline.resize({
          width: box.width,
          height: box.height,
          fit: opts.fit ?? "cover",
          position: opts.position ?? "attention",
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
  };
}
