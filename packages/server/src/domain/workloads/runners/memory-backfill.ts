// runner: memory-backfill (PD-41) — the corpus-wide memory sweep. Wraps `ctx.env.memory.backfill`
// (chat's `backfillMemory`: enumerate every chat × scope bucket, run the SAME idempotent segment/digest
// builds the engine's post-turn trigger uses, fold the counts). Resumable by nature (hash-diff self-heal);
// the signal aborts cooperatively between chats.
//
// PD-139(b) — the chat-memory arm of the PD-104 purge+reindex. After a COMPLETE BULK sweep re-derives every
// segment/digest into the box's active embed `(model)` space, it reclaims the rows stranded in any OTHER
// space via the injected embeddings purge op (the DELETE lives in embeddings/persistence, the ONE write
// path — never a raw db reach from here). BULK-ONLY (`ownerId === null`): a model change is a box-level
// event, so a singular per-owner catch-up must not delete the global old space. Skipped on abort — the
// space stays a strict superset (never a gap); the rerun reclaims it. Mirrors the embedCorpus/embedAssets
// purge guard exactly.

import type { Runner } from "../contract/runner";

export const memoryBackfillRunner: Runner<"memory-backfill"> = async (ctx, _params, report, signal) => {
  report({ message: "memory backfill: sweeping chats (segments + digests per scope)" });
  const counts = await ctx.env.memory.backfill({ ownerId: ctx.ownerId, signal });
  report({
    message: `memory backfill: ${counts.segments.scanned} chats (${counts.segments.changed} segments), ${counts.digests.scanned} scope buckets (${counts.digests.changed} digests)`,
  });
  if (ctx.ownerId === null && !signal.aborted) {
    await ctx.env.embeddings.purgeMemoryVectors();
  }
  return counts;
};
