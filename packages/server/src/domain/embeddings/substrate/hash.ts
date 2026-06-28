// domain/embeddings/substrate/hash — the ONE content-hash implementation for the vector substrate (the
// staleness gate + the cross-chat collapse key). Pure compute, zero I/O — a feature-local substrate helper
// (the same `node:crypto` CPU pattern character/substrate/content-hash.ts uses; `createHash` is hashing, not
// I/O, so `persistence-no-io` / substrate purity hold).
//
// Collapses the scattered inline variants neo-tavern had (db/vector-ops, chat/memory, corpus/service each
// rolled their own). SHA-256 hex over the raw content: a `string` is UTF-8 encoded, a `Uint8Array` is hashed
// verbatim. Both image lenses of one asset are hashed from the SAME resized bytes, so they share a
// content_hash and de-dup on re-index (embeddings.md §"content_hash").

import { createHash } from "node:crypto";

/** SHA-256 hex of the content. `string` → UTF-8; `Uint8Array` → the raw bytes. Deterministic: identical
 *  content always yields the identical hash (the property the staleness gate + re-index dedup rely on). */
export function contentHash(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
