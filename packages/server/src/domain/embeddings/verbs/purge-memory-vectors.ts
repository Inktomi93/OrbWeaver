// verb: purgeMemoryVectors — PD-139(b), the chat-memory arm of the PD-104 old-space reclaim. After a BULK
// memory-backfill re-derives every `chat_segment`/`chat_digest` into the box's active embed `(model)` space,
// the rows left in any OTHER space are stranded (both tables now key their idempotent upsert ON `model`, so a
// model change accretes a new space beside the old rather than overwriting it). This deletes them.
//
// The DELETE itself stays in embeddings/persistence (`purgeStaleVectors`) — the ONE vector write path; this
// verb only dispatches the two model-scoped purges. The active model is `roleClients.embedModel`, the SAME
// space tag the segment/digest embed writes key on (the embedCorpus idiom). BULK-ONLY + skip-on-abort is the
// CALLER's guard (the memory-backfill runner), mirroring the embedCorpus/embedAssets purge structure exactly.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeMemoryVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async ({ ownerId }): Promise<PurgeMemoryVectorsResult> => {
    const activeModel = await requireTaskModel(ctx, ownerId, "embed");
    if (activeModel === null) {
      return { segments: 0, digests: 0 };
    }
    const segments = await purgeStaleVectors(ctx.db, "chat_segments", ownerId, activeModel);
    const digests = await purgeStaleVectors(ctx.db, "chat_digests", ownerId, activeModel);
    return { segments, digests };
  };
}
