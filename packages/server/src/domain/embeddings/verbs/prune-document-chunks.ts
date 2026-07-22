// verb: pruneDocumentChunks — databank-design/05 §2.4, the reindex-shrink seam. The databank ingest upserts
// every current chunk of a document (hash-gated no-ops keep it cheap), THEN calls this to reclaim the strays:
// tail rows (`chunkIdx >= keepCount`, a shrunk chunk set) AND rows in a retired `(model)` space, scoped to
// the one document. Store-then-prune (never clear-then-store) preserves the no-op economy.
//
// The DELETE stays in embeddings/persistence (`pruneDocumentChunks`) — the ONE vector write path; databank
// never touches `document_chunks` directly (the single-write-path invariant, dep-cruiser-enforced). This
// mirrors `writeHubScores` as a narrow, named, non-`store` write seam.

import type { EmbeddingsContext } from "../context";
import type { PruneDocumentChunksParams } from "../contract/params";
import type { PruneDocumentChunksResult } from "../contract/results";
import type { EmbeddingsService } from "../contract/service";
import { pruneDocumentChunks } from "../persistence/clear";

export function createPruneDocumentChunks(ctx: EmbeddingsContext): EmbeddingsService["pruneDocumentChunks"] {
  return async (params: PruneDocumentChunksParams): Promise<PruneDocumentChunksResult> => {
    const rowsDeleted = await pruneDocumentChunks(ctx.db, params.documentId, params.keepCount, params.model);
    return { rowsDeleted };
  };
}
