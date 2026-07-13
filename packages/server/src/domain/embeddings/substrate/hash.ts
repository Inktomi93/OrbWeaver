// domain/embeddings/substrate/hash — the one content-hash implementation for the vector substrate (the
// staleness gate + the cross-chat collapse key). Pure compute, zero I/O.

import { sha256Hex } from "#kit/content-hash";

/** SHA-256 hex of the content. Deterministic — the staleness gate + re-index dedup rely on this. */
export function contentHash(content: string | Uint8Array): string {
  return sha256Hex(content);
}
