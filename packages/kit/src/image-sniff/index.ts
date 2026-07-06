// kit/image-sniff — sniffMime: the pure magic-byte signature sniff shared by the assets domain and the
// vllm providers backend (PD-123; extends PD-29 + D61/B5a — "a pure `@orb/kit/image-sniff` … the
// signature tables promote to kit so infra and assets share ONE table"). STRICT semantics: no match →
// `application/octet-stream`, never a guessed default — a caller that wants a fallback (e.g. vllm's
// png-default for the data-URI path) applies `?? 'image/png'` at ITS OWN call site, not here.
//
// KIT-PURITY: no `node:buffer` (kit is isomorphic — browser + Node, see png-card-chunk's header for the
// precedent). Hex is hand-packed from raw bytes instead of `Buffer.toString("hex")`.
//
// Signatures are compared as HEX PREFIXES (string constants), not byte-array literals — the bytes carry
// no arithmetic meaning, and the hex form is both linter-clean (noMagicNumbers) and self-documenting.

const HEX_RADIX = 16;
const BYTE_HEX_WIDTH = 2;

// Leading hex signatures (lowercase). The trailing ASCII bytes spell the format tag in each case.
const PNG_HEX = "89504e47";
const JPEG_HEX = "ffd8ff";
const GIF87A_HEX = "474946383761"; // "GIF87a"
const GIF89A_HEX = "474946383961"; // "GIF89a"
const RIFF_HEX = "52494646"; // "RIFF" — the WebP container magic (bytes 0..3)
const WEBP_HEX = "57454250"; // "WEBP" — the form tag (bytes 8..11)

// The WebP tag sits after the 4-byte RIFF magic + 4-byte chunk size; the header we ever need is 12 bytes.
const WEBP_TAG_START = 8;
const HEADER_LEN = 12;

const PNG_MIME = "image/png";
const JPEG_MIME = "image/jpeg";
const GIF_MIME = "image/gif";
const WEBP_MIME = "image/webp";
const OCTET_STREAM = "application/octet-stream";

// Exported (contracts/types-in-contract doesn't apply to `kit` — it's the leaf below contracts, and
// callers in two different packages need this exact union to narrow on the result).
export type SniffedMime =
  | typeof PNG_MIME
  | typeof JPEG_MIME
  | typeof GIF_MIME
  | typeof WEBP_MIME
  | typeof OCTET_STREAM;

/** `bytes[start..end)` as a lowercase hex string — the `Buffer.toString("hex")` equivalent, hand-packed
 *  so this module has no `node:buffer` dependency (kit-purity: browser + Node isomorphic). */
function hexSlice(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end && i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(HEX_RADIX).padStart(BYTE_HEX_WIDTH, "0");
  }
  return out;
}

/** The detected image MIME from the leading magic bytes, or `application/octet-stream` when no known
 *  signature matches (PNG/JPEG/GIF/WebP only). Pure — never throws, never reads past the header; a buffer
 *  shorter than a signature simply fails to match (the hex prefix is too short). */
export function sniffMime(bytes: Uint8Array): SniffedMime {
  const lead = hexSlice(bytes, 0, HEADER_LEN);
  if (lead.startsWith(PNG_HEX)) {
    return PNG_MIME;
  }
  if (lead.startsWith(JPEG_HEX)) {
    return JPEG_MIME;
  }
  if (lead.startsWith(GIF87A_HEX) || lead.startsWith(GIF89A_HEX)) {
    return GIF_MIME;
  }
  if (lead.startsWith(RIFF_HEX) && hexSlice(bytes, WEBP_TAG_START, HEADER_LEN) === WEBP_HEX) {
    return WEBP_MIME;
  }
  return OCTET_STREAM;
}
