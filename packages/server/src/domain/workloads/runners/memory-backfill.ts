// runner: memory-backfill (PD-41) — the corpus-wide memory sweep. Wraps `ctx.env.memory.backfill`
// (chat's `backfillMemory`: enumerate every chat × scope bucket, run the SAME idempotent segment/digest
// builds the engine's post-turn trigger uses, fold the counts). Resumable by nature (hash-diff self-heal);
// the signal aborts cooperatively between chats.

import type { Runner } from "../contract/runner";

export const memoryBackfillRunner: Runner<"memory-backfill"> = async (
  ctx,
  _params,
  report,
  signal,
) => {
  report({ message: "memory backfill: sweeping chats (segments + digests per scope)" });
  const counts = await ctx.env.memory.backfill({ ownerId: ctx.ownerId, signal });
  report({
    message: `memory backfill: ${counts.segments.scanned} chats (${counts.segments.changed} segments), ${counts.digests.scanned} scope buckets (${counts.digests.changed} digests)`,
  });
  return counts;
};
