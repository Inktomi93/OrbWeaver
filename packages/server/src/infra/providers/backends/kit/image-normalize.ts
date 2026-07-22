// infra/providers/backends/kit/image-normalize — the wire-normalize seam for outbound image INPUT bytes
// (MA-6). A hosted vision/embed/edit turn base64-labels raw card bytes into a `data:` URL; a GIF sent
// as-is is (a) mislabeled (the runners assumed png regardless of format) and (b) an animated multi-frame
// blob most hosted decoders reject or mis-read. This op decodes a GIF to a SINGLE first-frame PNG (via an
// INJECTED sharp transform — the seam that keeps `infra/image` from leaking into a sealed backend) and
// passes every other format through untouched. The GIF decode also strips ALL metadata (sharp drops
// EXIF/GPS/XMP by default) — a privacy win for bytes that leave the box.
//
// The magic-sniff is the SYNC gate: `@orb/kit/image-sniff`'s pure signature table (GIF87a/GIF89a) decides
// BEFORE any async work, so the dominant non-gif path never allocates a second buffer.

import { sniffMime } from "@orb/kit/image-sniff";

const PNG_MIME = "image/png";
const GIF_MIME = "image/gif";

/** Normalized outbound image bytes + the mime to LABEL them with on the wire. */
export interface NormalizedImageBytes {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

/** Normalize one outbound image-input buffer for a hosted wire (async: a GIF decode is I/O-bound). A
 *  call-signature interface (not a `type` alias): exported function shapes ride an interface in this
 *  infra-pure tier — the `no-inline-types` gate reserves exported `type` aliases for type-home dirs. */
export type NormalizeImageBytes = (bytes: Uint8Array) => Promise<NormalizedImageBytes>;

/** The sharp seam this normalizer needs: decode → re-encode PNG (metadata stripped). Injected as a bare
 *  function so `backends/kit` never imports `infra/image` (a sibling infra module) — the strategy-isolation
 *  seam. Compose binds `imageAdapter.transform(bytes, { format: 'png' })`. */
export type ImageToPng = (bytes: Uint8Array) => Promise<Uint8Array>;

/** Build the gif-normalizing wire op. A GIF is decoded to a first-frame PNG (metadata stripped) via the
 *  injected `toPng`; every other format passes through with the `image/png` label the hosted image wires
 *  already assume (the provider re-sniffs the actual bytes — the label is a formality, the decode is the
 *  fix). The sync sniff gates the async decode so non-gif bytes never touch sharp. */
export function createImageNormalizer(toPng: ImageToPng): NormalizeImageBytes {
  return async (bytes) => {
    if (sniffMime(bytes) !== GIF_MIME) {
      return { bytes, mediaType: PNG_MIME };
    }
    return { bytes: await toPng(bytes), mediaType: PNG_MIME };
  };
}

/** The label-only fallback used when no sharp transform is wired (a test/DI-less path): byte-identical
 *  passthrough with the same `image/png` label the runners historically emitted — no GIF decode. */
export const passthroughImageNormalizer: NormalizeImageBytes = (bytes) => Promise.resolve({ bytes, mediaType: PNG_MIME });
