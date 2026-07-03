// domain/assets/substrate/mime — sniffMime: the pure magic-byte signature sniff. Two callers: the `store`
// verb's `enforceMagic` boundary (the claimed mime is verified against the bytes) and — when the
// maintenance verbs land — DR rebuild (the row's mime is best-effort). PNG/JPEG/GIF/WebP cover every image
// format we serve; anything else is the `application/octet-stream` "unrecognized signature" sentinel
// (NEVER a valid claimed mime at the upload boundary — esoterica #7). Asset-specific + server-only, so it
// stays domain substrate; FLAG[PD-29]: → `@orb/kit/assets` iff the client ever needs to pre-sniff an
// upload before sending.
//
// Signatures are compared as HEX PREFIXES (string constants), not byte-array literals — the bytes carry no
// arithmetic meaning, and the hex form is both linter-clean (noMagicNumbers) and self-documenting.

import { Buffer } from "node:buffer";

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

// File-local (not exported — types-in-contract reserves exported types for contract/): the exact set of
// strings sniffMime can return, so the return type isn't misleadingly widened to `string`.
type SniffedMime =
  | typeof PNG_MIME
  | typeof JPEG_MIME
  | typeof GIF_MIME
  | typeof WEBP_MIME
  | typeof OCTET_STREAM;

function hexSlice(bytes: Uint8Array, start: number, end: number): string {
  return Buffer.from(bytes.subarray(start, end)).toString("hex");
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
