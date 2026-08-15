// The client-side asset-upload size pre-check — the SAME pattern `@orb/ui/file-dropzone`'s
// `maxSizeBytes` runs internally, extracted so the two FileTrigger-driven avatar pickers
// (persona/character) can pre-check BEFORE the multipart POST even though `FileTrigger` (unlike
// `FileDropzone`) has no built-in size ceiling of its own. Reads `UploadCaps.assetUpload` — the
// single-asset route's hard byte ceiling (`@orb/contracts/uploads`) — so an oversized pick fails fast
// with a size-aware message instead of a bare "Upload failed" after a round trip the server was always
// going to 413 anyway.

import { formatBytes } from "@orb/kit/strings";

/** `undefined` when `file` is within `maxBytes`; otherwise the size-aware rejection message
 *  (mirrors `FileDropzone`'s own rejection copy — "`name` exceeds the `limit` limit"). */
export function oversizeUploadMessage(file: File, maxBytes: number): string | undefined {
  if (file.size <= maxBytes) {
    return;
  }
  return `${file.name} exceeds the ${formatBytes(maxBytes)} limit`;
}
