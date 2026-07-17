// verb: purgeMemoryVectors — PD-139(b), the chat-memory arm of the PD-104 old-space reclaim. After a BULK
// memory-backfill re-derives every `chat_segment`/`chat_digest` into the box's active embed `(model)` space,
// the rows left in any OTHER space are stranded (both tables now key their idempotent upsert ON `model`, so a
// model change accretes a new space beside the old rather than overwriting it). This deletes them.
//
// The DELETE itself stays in embeddings/persistence (`purgeStaleVectors`) — the ONE vector write path; this
// verb only dispatches the two model-scoped purges. The active model is `roleClients.embedModel`, the SAME
// space tag the segment/digest embed writes key on (the embedCorpus idiom). BULK-ONLY + skip-on-abort is the
// CALLER's guard (the memory-backfill runner), mirroring the embedCorpus/embedAssets purge structure exactly.

import type { EmbeddingsContext } from "../context";
import type { PurgeMemoryVectorsResult } from "../contract/results";
import type { EmbeddingsService } from "../contract/service";
import { purgeStaleVectors } from "../persistence/clear";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async (): Promise<PurgeMemoryVectorsResult> => {
    const activeModel = ctx.roleClients.embedModel;
    const segments = await purgeStaleVectors(ctx.db, "chat_segments", activeModel);
    const digests = await purgeStaleVectors(ctx.db, "chat_digests", activeModel);
    return { segments, digests };
  };
}
