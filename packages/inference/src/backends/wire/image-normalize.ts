// infra/providers/backends/wire/image-normalize — the wire-normalize seam for outbound image INPUT bytes
// (MA-6). A hosted vision/embed/edit turn base64-labels raw card bytes into a `data:` URL; a GIF sent
// as-is is (a) mislabeled (the runners assumed png regardless of format) and (b) an animated multi-frame
// blob most hosted decoders reject or mis-read. This op decodes a GIF to a SINGLE first-frame PNG (via an
// INJECTED sharp transform — the seam that keeps `infra/image` from leaking into a sealed backend) and
// passes recognized static formats through with their sniffed MIME. GIF and unknown bytes are decoded to
// PNG before they receive a wire label. The decode also strips ALL metadata (sharp drops
// EXIF/GPS/XMP by default) — a privacy win for bytes that leave the box.
//
// The magic-sniff is the SYNC gate: `@orb/kit/image-sniff`'s pure signature table (GIF87a/GIF89a) decides
// BEFORE any async work, so the dominant non-gif path never allocates a second buffer.

import type { ImageInput } from "@orb/contracts/role-clients";
import { sniffMime } from "@orb/kit/image-sniff";
import type { ImageToPng, NormalizeImageBytes } from "../../contract/wire.ts";

const BASE64 = "base64";
const DATA_URL_PREFIX = "data:";
const PNG_MIME = "image/png";
const JPEG_MIME = "image/jpeg";
const WEBP_MIME = "image/webp";

/** Build the image-normalizing wire op. Recognized static formats keep their bytes and exact MIME; GIF and
 *  unknown bytes are decoded to PNG (metadata stripped) via the injected `toPng`. */
export function createImageNormalizer(toPng: ImageToPng): NormalizeImageBytes {
  return async (bytes) => {
    const mime = sniffMime(bytes);
    if (mime === PNG_MIME || mime === JPEG_MIME || mime === WEBP_MIME) {
      return { bytes, mediaType: mime };
    }
    // GIF must be flattened; unknown bytes must be decoded before they can honestly carry an image label.
    return { bytes: await toPng(bytes), mediaType: PNG_MIME };
  };
}

/** The label-only fallback used when no sharp transform is wired (a test/DI-less path): byte-identical
 *  passthrough with the same `image/png` label the runners historically emitted — no GIF decode. */
export const passthroughImageNormalizer: NormalizeImageBytes = (bytes) => Promise.resolve({ bytes, mediaType: PNG_MIME });

/** One image input → a URL a hosted wire accepts: a string passes through (URL / data-URL); raw bytes are
 *  wire-normalized (GIF → first-frame PNG — MA-6) then base64 data-URL-encoded with the normalized mime. */
export async function toImageUrl(image: ImageInput, normalize: NormalizeImageBytes): Promise<string> {
  if (typeof image === "string") {
    return image;
  }
  const { bytes, mediaType } = await normalize(image);
  return `${DATA_URL_PREFIX}${mediaType};base64,${Buffer.from(bytes).toString(BASE64)}`;
}

export type { ImageToPng, NormalizeImageBytes } from "../../contract/wire.ts";
