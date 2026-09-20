// verb: purgeMemoryVectors — PD-139(b), the chat-memory arm of the PD-104 old-space reclaim. After a BULK
// memory-backfill re-derives every `chat_segment`/`chat_digest` into the box's active embed `(model)` space,
// the rows left in any OTHER space are stranded (both tables now key their idempotent upsert ON `model`, so a
// model change accretes a new space beside the old rather than overwriting it). This deletes them.
//
// The DELETE itself stays in embeddings/persistence (`purgeStaleVectors`) — the ONE vector write path; this
// verb only dispatches the two model-scoped purges. The active model is `roleClients.embedModel`, the SAME
// space tag the segment/digest embed writes key on (the embedCorpus idiom). BULK-ONLY + skip-on-abort is the
// CALLER's guard (the memory-backfill runner), mirroring the embedCorpus/embedAssets purge structure exactly.
//
// IT ALSO RECORDS THE COMPLETION (§10-5, `embed_space_state` scope `memory`), and that is honest HERE
// specifically because of the caller's guard: this verb is reachable only from the chat memory-backfill
// workload's terminal, which fires only for a BULK (`ownerId === null`), non-aborted sweep — so every owner
// the compose fan hands us is an owner whose memory that sweep just rebuilt. The mark is written BEFORE the
// purge and the purge deletes around THAT recorded space, so "what completed" and "what survived" are one
// value rather than two independently-resolved ones.
//
// THE MARK'S HOME HERE IS THE EMBEDDINGS BOUNDARY: the backfill that re-embeds these rows lives in
// `domain/chat`, while this verb is the terminal that owns both the completion record and old-space purge.

import type { EmbeddingsContext } from "../context.ts";
import type { PurgeMemoryVectorsResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { purgeStaleVectors } from "../persistence/clear.ts";
import { upsertCompletedSpace } from "../persistence/space-state.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

export function createPurgeMemoryVectors(ctx: EmbeddingsContext): EmbeddingsService["purgeMemoryVectors"] {
  return async ({ ownerId, completedSpace }): Promise<PurgeMemoryVectorsResult> => {
    const activeModel = await requireTaskModel(ctx, ownerId, "embed");
    if (activeModel === null) {
      return { segments: 0, digests: 0 };
    }
    if (activeModel !== completedSpace) {
      throw new Error(`memory embed space changed before purge for owner ${ownerId}`);
    }
    await upsertCompletedSpace(ctx.db, { ownerId, scope: "memory", space: completedSpace, now: ctx.now() });
    const segments = await purgeStaleVectors(ctx.db, "chat_segments", ownerId, completedSpace);
    const digests = await purgeStaleVectors(ctx.db, "chat_digests", ownerId, completedSpace);
    return { segments, digests };
  };
}
