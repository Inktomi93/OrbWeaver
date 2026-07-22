// verb: purgeDocumentVectors — PD-139(c), the databank arm of the PD-104 old-space reclaim. After a BULK
// databank-reindex re-embeds every document chunk into the box's active embed `(model)` space, the rows left
// in any OTHER space are stranded (`document_chunks` keys its idempotent upsert ON `model`, so a model change
// accretes a new space beside the old rather than overwriting it). This deletes them.
//
// The DELETE itself stays in embeddings/persistence (`purgeStaleVectors`) — the ONE vector write path; this
// verb only dispatches the model-scoped purge over `document_chunks`. The active model is
// `roleClients.embedModel`, the SAME space tag the chunk embed writes key on. BULK-ONLY + skip-on-abort is the
// CALLER's guard (the databank-reindex runner), mirroring `purgeMemoryVectors` / the embedCorpus purge exactly.

import type { EmbeddingsContext } from "../context";
import type { PurgeDocumentVectorsResult } from "../contract/results";
import type { EmbeddingsService } from "../contract/service";
import { purgeStaleVectors } from "../persistence/clear";

export function createPurgeDocumentVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeDocumentVectors"] {
  return async (): Promise<PurgeDocumentVectorsResult> => {
    const chunks = await purgeStaleVectors(ctx.db, "document_chunks", ctx.roleClients.embedModel);
    return { chunks };
  };
}
