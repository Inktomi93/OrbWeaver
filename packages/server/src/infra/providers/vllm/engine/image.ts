// Shared image→data-URI helper for three role surfaces (chat-completion vision turns, rerank multimodal
// params, image-embed); engine-level because a surface may not import a sibling surface. base64 data URIs
// score/embed identically to remote URLs and keep the loopback engine off the network. MIME sniff uses
// `@orb/kit/image-sniff`'s shared strict table (PD-123), but defaults an unrecognized signature to png
// HERE rather than octet-stream — these inputs aren't CAS-validated and octet-stream would silently break
// the vision model's decode.

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import type { ImageInput } from "@orb/contracts/role-clients";
import { sniffMime as sniffMimeStrict } from "@orb/kit/image-sniff";

const DEFAULT_MIME = "image/png";
const OCTET_STREAM = "application/octet-stream";

/** Magic-byte MIME sniff for the image formats this engine sends; defaults to png (the dominant card
 *  format) on an unrecognized signature — unlike the shared strict primitive, a miss here is a safe
 *  fallback for the data-URI path rather than a corruption signal (see header). */
export function sniffMime(bytes: Uint8Array): string {
  const detected = sniffMimeStrict(bytes);
  return detected === OCTET_STREAM ? DEFAULT_MIME : detected;
}

/** {@link ImageInput} (bytes or a filesystem path) → a base64 data URI the engine consumes directly. */
export async function toDataUri(input: ImageInput): Promise<string> {
  const bytes: Uint8Array = typeof input === "string" ? new Uint8Array(await readFile(input)) : new Uint8Array(input);
  const mime = sniffMime(bytes);
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
