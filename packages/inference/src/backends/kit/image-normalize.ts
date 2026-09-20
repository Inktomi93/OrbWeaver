// infra/providers/backends/kit/image-normalize — the wire-normalize seam for outbound image INPUT bytes
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

import { sniffMime } from "@orb/kit/image-sniff";

const PNG_MIME = "image/png";
const JPEG_MIME = "image/jpeg";
const WEBP_MIME = "image/webp";

/** Normalized outbound image bytes + the mime to LABEL them with on the wire. */
interface NormalizedImageBytes {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

/** Normalize one outbound image-input buffer for a hosted wire (async: a GIF decode is I/O-bound). A
 *  call-signature interface (not a `type` alias): exported function shapes ride an interface in this
 *  infra-pure tier — the `no-inline-types` gate reserves exported `type` aliases for type-home dirs. */
export interface NormalizeImageBytes {
  // biome-ignore lint/style/useShorthandFunctionType: the shorthand is an exported `type` alias, which the `no-inline-types` gate reserves for the type-home dirs — this infra-pure tier names its shapes with `interface` (see this declaration's own header).
  (bytes: Uint8Array): Promise<NormalizedImageBytes>;
}

/** The sharp seam this normalizer needs: decode → re-encode PNG (metadata stripped). Injected as a bare
 *  function so `backends/kit` never imports `infra/image` (a sibling infra module) — the strategy-isolation
 *  seam. Compose binds `imageAdapter.transform(bytes, { format: 'png' })`. */
export interface ImageToPng {
  // biome-ignore lint/style/useShorthandFunctionType: same as `NormalizeImageBytes` above — the shorthand is an exported `type` alias, reserved by `no-inline-types` for the type-home dirs.
  (bytes: Uint8Array): Promise<Uint8Array>;
}

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
