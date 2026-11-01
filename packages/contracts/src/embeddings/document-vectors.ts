// Databank-facing vector data. The `document_chunks` table is embeddings-owned; databank reaches it through injected
// ops over these shapes. The embed call's AbortSignal is a runtime type, so the executing domains add it.

import type { DocumentId, UserId } from "@orb/kit/ids";

/** Embed a databank document chunk. `content` is the chunk slice (kit/chunk output, incl. any overlap prefix) —
 *  the embed input; the store hashes it for the staleness gate. `model` is the caller-supplied active embed space
 *  (its width is the owner's generation's); the `fkRefs` locate the chunk in its producer document. No `hubScore`
 *  (discovery-only). Unique key: `(documentId, chunkIdx, model)`. */
export interface DocumentChunkStoreInput {
  readonly lens: "chunk";
  readonly ownerId: UserId;
  readonly content: string;
  readonly model: string;
  readonly fkRefs: {
    readonly documentId: DocumentId;
    readonly chunkIdx: number;
    /** The non-overlap span offsets into `documents.extractedText` (source highlighting + lossless coverage). */
    readonly charStart: number;
    readonly charEnd: number;
  };
}

/** `pruneDocumentChunks` input — the reindex-shrink seam. After the ingest upserts every current chunk
 *  (hash-gated no-ops keep it cheap), this deletes the tail rows (`chunkIdx >= keepCount`, a shrunk chunk
 *  set) of the owner's active embed generation. Retired spaces are reclaimed when the generation moves, not here. The delete lives in the table owner because
 *  databank never touches `document_chunks` directly (the single-write-path invariant). */
export interface PruneDocumentChunksParams {
  readonly documentId: DocumentId;
  /** Delete rows with `chunkIdx >= keepCount` (the shrunk-tail reclaim). */
  readonly keepCount: number;
}

/** The databank chunk-count read (the DocumentView `chunkCount`/`embeddedCount` derivation). */
export interface CountDocumentChunksParams {
  readonly documentIds: readonly DocumentId[];
  readonly model: string;
}

/** The databank BANK-WIDE chunk read — the twin above, scoped by OWNER instead of by id list. Owner-scoped
 *  because its callers do not know their id set yet: the library's phase lens resolves a predicate over the
 *  whole bank BEFORE it pages, and the health census sums the whole bank by definition. */
export interface OwnerChunkCountsParams {
  readonly ownerId: UserId;
  readonly model: string;
}
