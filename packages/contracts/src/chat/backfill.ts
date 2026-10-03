// `@orb/contracts/chat` — the params and terminal results of chat's two corpus-sweep workloads (the workloads
// junk-drawer exit: a workload's params and result shapes are domain↔domain wire, authored by the OWNING
// domain). `memory-backfill` sweeps the memory subsystem's segments/digests; `group-character-backfill` mints
// the synthetic group character for every >1-character room that lacks one (D38).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** memory-backfill: `chatIds` narrows the sweep to those chats inside the row's enumeration scope (absent =
 *  every chat in scope). An import's "Build memory for imported chats" offer sends the chats that import
 *  wrote, so the run and its model-call count cover those chats and nothing else. A foreign id outside the
 *  scope matches nothing; the sweep intersects, never widens. */
export const memoryBackfillWorkloadParams = z.object({ chatIds: z.array(typeIdSchema(ID_PREFIX.chat)).min(1).readonly().optional() });
export type MemoryBackfillWorkloadParams = z.infer<typeof memoryBackfillWorkloadParams>;

/** A backfill sweep's counts: rows examined, rows changed. Shared by both sweeps. */
export interface BackfillPassResult {
  readonly scanned: number;
  readonly changed: number;
}

export interface MemoryBackfillResult {
  readonly segments: BackfillPassResult;
  readonly digests: BackfillPassResult;
  /** Verbatim blocks that could not even be CHUNKED into the embed model's window (past the pathological
   *  ceiling): skipped WHOLE, never truncated — a truncated segment vector would claim a seq-span it never
   *  read and silently drop memory-feeding content (owner ruling, #165). An ordinary over-window block is
   *  chunked and loses nothing (#172), so this is normally 0. Recorded here + in the progress copy + a `warn`
   *  log per block, so the gap is a stated fact; the content-hash self-heal re-offers each block every pass. */
  readonly segmentsSkippedOverWindow: number;
  /** Chats whose per-chat build threw an UNEXPECTED error and were isolated-and-skipped. A non-silent
   *  skip: the sweep survives one bad chat, but the failure lands in the durable result JSON (and an
   *  `error`-level log), never vanishing without a trace. */
  readonly failed: number;
}

export const backfillPassResultSchema = z.strictObject({ scanned: z.number(), changed: z.number() }) satisfies z.ZodType<BackfillPassResult>;

export const memoryBackfillResultSchema = z.strictObject({
  segments: backfillPassResultSchema,
  digests: backfillPassResultSchema,
  segmentsSkippedOverWindow: z.number(),
  failed: z.number(),
}) satisfies z.ZodType<MemoryBackfillResult>;
