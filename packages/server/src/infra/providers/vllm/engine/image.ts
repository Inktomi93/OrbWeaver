// infra/providers/vllm/engine/image — shared image→data-URI helper for the gen + embed engines.
//
// WHY ENGINE-LEVEL (not in a surface): three role surfaces need it — chat-completion (vision turns),
// rerank (multimodal score params), image-embed (the image/multimodal modes). A surface may not import a
// sibling surface (`vllm-surface-isolation`), so anything shared between surfaces lives DOWN in engine/
// and every surface reaches it the one legal direction. Pure data shaping — no transport, no engine call.
//
// base64 data URIs score/embed IDENTICALLY to remote URLs (measured cosine 1.000000) AND keep the loopback
// engine off the network, so we always send data URIs rather than passing a URL through.
//
// MIME SNIFF (PD-123): the signature table is `@orb/kit/image-sniff`'s `sniffMime` — the SAME table the
// assets domain uses (PD-29/D61 B5a: "infra and assets share ONE table"). That shared helper is STRICT
// (unrecognized bytes → `application/octet-stream`, never a guess). This site's own images are NOT
// necessarily CAS-validated (vision-turn / rerank / image-embed inputs can be arbitrary caller bytes), and
// an `octet-stream` data URI would silently break the vision model's image decode — so the png default
// stays HERE, applied locally to kit's strict result, rather than baked into the shared primitive.

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
  const bytes: Uint8Array =
    typeof input === "string" ? new Uint8Array(await readFile(input)) : new Uint8Array(input);
  const mime = sniffMime(bytes);
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}
