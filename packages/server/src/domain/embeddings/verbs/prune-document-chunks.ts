// verb: pruneDocumentChunks, the reindex-shrink seam. The databank ingest upserts
// every current chunk of a document (hash-gated no-ops keep it cheap), THEN calls this to reclaim the strays:
// tail rows (`chunkIdx >= keepCount`, a shrunk chunk set) AND rows in a retired `(model)` space, scoped to
// the one document. Store-then-prune (never clear-then-store) preserves the no-op economy.
//
// The DELETE stays in embeddings/persistence (`pruneDocumentChunks`) — the ONE vector write path; databank
// never touches `document_chunks` directly (the single-write-path invariant, dep-cruiser-enforced). This
// mirrors `writeHubScores` as a narrow, named, non-`store` write seam.

import type { EmbeddingsContext } from "../context.ts";
import type { PruneDocumentChunksParams } from "../contract/params.ts";
import type { PruneDocumentChunksResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { pruneDocumentChunks } from "../persistence/clear.ts";
import { loadDocumentOwnerForPrune } from "../persistence/queries.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";

export function createPruneDocumentChunks(ctx: EmbeddingsContext): EmbeddingsService["pruneDocumentChunks"] {
  return async (params: PruneDocumentChunksParams): Promise<PruneDocumentChunksResult> => {
    const ownerId = await loadDocumentOwnerForPrune(ctx.db, params.documentId);
    const generation = ownerId === null ? null : await resolveTargetGeneration(ctx, ownerId, "embed");
    const rowsDeleted = generation === null ? 0 : await pruneDocumentChunks(ctx.db, params.documentId, params.keepCount, generation.id);
    return { rowsDeleted };
  };
}
