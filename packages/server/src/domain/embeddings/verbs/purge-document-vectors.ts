// verb: purgeDocumentVectors — PD-139(c), the databank arm of the PD-104 old-space reclaim. After a BULK
// databank-reindex re-embeds every document chunk into the OWNER's active embed `(model)` space, the owner's rows left
// in any OTHER space are stranded (`document_chunks` keys its idempotent upsert ON `model`, so a model change
// accretes a new space beside the old rather than overwriting it). This deletes them.
//
// The DELETE itself stays in embeddings/persistence (`purgeStaleVectors`) — the ONE vector write path; this
// verb only dispatches the owner-scoped purge over `document_chunks`. The active model is the owner's resolved
// `embed` binding, the SAME space tag the chunk embed writes key on. BULK-ONLY + skip-on-abort is the
// CALLER's guard (the databank-reindex runner), mirroring `purgeMemoryVectors` / the embedCorpus purge exactly.
//
// IT ALSO RECORDS THE COMPLETION (§10-5, `embed_space_state` scope `documents`), for exactly the reason
// `purgeMemoryVectors` does: the caller's BULK + non-aborted guard means every owner reaching this verb is
// an owner whose document chunks the sweep just re-embedded. The mark lands BEFORE the purge and the purge
// deletes around the recorded space, so "what completed" and "what survived" are one value.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeDocumentVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { upsertCompletedSpace } from "../persistence/space-state.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

export function createPurgeDocumentVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeDocumentVectors"] {
  return async ({ ownerId }): Promise<PurgeDocumentVectorsResult> => {
    const activeModel = await requireTaskModel(ctx, ownerId, "embed");
    if (activeModel === null) {
      return { chunks: 0 };
    }
    await upsertCompletedSpace(ctx.db, { ownerId, scope: "documents", space: activeModel, now: ctx.now() });
    const chunks = await purgeStaleVectors(ctx.db, "document_chunks", ownerId, activeModel);
    return { chunks };
  };
}
