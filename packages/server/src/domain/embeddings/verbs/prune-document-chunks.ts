// verb: pruneDocumentChunks — databank-design/05 §2.4, the reindex-shrink seam. The databank ingest upserts
// every current chunk of a document (hash-gated no-ops keep it cheap), THEN calls this to reclaim the strays:
// tail rows (`chunkIdx >= keepCount`, a shrunk chunk set) AND rows in a retired `(model)` space, scoped to
// the one document. Store-then-prune (never clear-then-store) preserves the no-op economy.
//
// The DELETE stays in embeddings/persistence (`pruneDocumentChunks`) — the ONE vector write path; databank
// never touches `document_chunks` directly (the single-write-path invariant, dep-cruiser-enforced). This
// mirrors `writeHubScores` as a narrow, named, non-`store` write seam.

import { documents } from "@orb/db";
import { eq } from "drizzle-orm";
import type { EmbeddingsContext } from "../context.ts";
import type { PruneDocumentChunksParams } from "../contract/params.ts";
import type { PruneDocumentChunksResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { pruneDocumentChunks } from "../persistence/clear.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";

export function createPruneDocumentChunks(ctx: EmbeddingsContext): EmbeddingsService["pruneDocumentChunks"] {
  return async (params: PruneDocumentChunksParams): Promise<PruneDocumentChunksResult> => {
    const owner = await ctx.db.select({ ownerId: documents.ownerId }).from(documents).where(eq(documents.id, params.documentId)).limit(1);
    const generation = owner[0] === undefined ? null : await resolveTargetGeneration(ctx, owner[0].ownerId, "embed");
    const rowsDeleted = generation === null ? 0 : await pruneDocumentChunks(ctx.db, params.documentId, params.keepCount, generation.id);
    return { rowsDeleted };
  };
}
