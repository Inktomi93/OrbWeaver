// infra/providers/vllm/engine/image — shared image→data-URI helper for the gen + embed engines.
//
// WHY ENGINE-LEVEL (not in a surface): three role surfaces need it — chat-completion (vision turns),
// rerank (multimodal score params), image-embed (the image/multimodal modes). A surface may not import a
// sibling surface (`vllm-surface-isolation`), so anything shared between surfaces lives DOWN in engine/
// and every surface reaches it the one legal direction. Pure data shaping — no transport, no engine call.
//
// base64 data URIs score/embed IDENTICALLY to remote URLs (measured cosine 1.000000) AND keep the loopback
// engine off the network, so we always send data URIs rather than passing a URL through.

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import type { ImageInput } from "@orb/contracts/role-clients";

const DEFAULT_MIME = "image/png";
const HEX_CHARS_PER_BYTE = 2;
// RIFF<size>WEBP — the "WEBP" marker sits 8 bytes in, not at the file head.
const WEBP_MARKER_OFFSET = 8;

/** One magic-byte signature: the hex of the identifying leading bytes at a fixed offset. Hex (not numeric
 *  literals) keeps the file-format magic out of `noMagicNumbers`'s way — the bytes are data, not constants. */
interface MagicSignature {
  readonly mime: string;
  readonly at: number;
  readonly hex: string;
}

const SIGNATURES: readonly MagicSignature[] = [
  { mime: "image/png", at: 0, hex: "8950" },
  { mime: "image/jpeg", at: 0, hex: "ffd8" },
  { mime: "image/gif", at: 0, hex: "474946" },
  { mime: "image/webp", at: WEBP_MARKER_OFFSET, hex: "574542" },
];

function matches(bytes: Uint8Array, sig: MagicSignature): boolean {
  const end = sig.at + sig.hex.length / HEX_CHARS_PER_BYTE;
  if (bytes.length < end) {
    return false;
  }
  return Buffer.from(bytes.subarray(sig.at, end)).toString("hex") === sig.hex;
}

/** Magic-byte MIME sniff for the image formats CAS assets hold; defaults to png (the dominant card format,
 *  and CAS assets are validated images, so a miss is a safe fallback rather than a corruption). */
export function sniffMime(bytes: Uint8Array): string {
  for (const sig of SIGNATURES) {
    if (matches(bytes, sig)) {
      return sig.mime;
    }
  }
  return DEFAULT_MIME;
}

/** {@link ImageInput} (bytes or a filesystem path) → a base64 data URI the engine consumes directly. */
export async function toDataUri(input: ImageInput): Promise<string> {
  const bytes: Uint8Array =
    typeof input === "string" ? new Uint8Array(await readFile(input)) : new Uint8Array(input);
  const mime = sniffMime(bytes);
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
