// `@orb/contracts/chat` — the params and terminal results of chat's two corpus-sweep workloads (the workloads
// junk-drawer exit: a workload's params and result shapes are domain↔domain wire, authored by the OWNING
// domain). `memory-backfill` sweeps the memory subsystem's segments/digests; `group-character-backfill` mints
// the synthetic group character for every >1-character room that lacks one (D38).

import { z } from "zod";

/** An import's scope handle: the server-clock span (epoch ms, both ends inclusive) in which the import wrote its
 *  chats. A chat is in scope when its import claim (`chat_import_claims.createdAt`) falls inside the span. The
 *  handle is two numbers however many chats the import wrote, so it travels in any request. */
export interface ImportWindow {
  readonly from: number;
  readonly to: number;
}

/** The span as a stored result carries it: shape only. A coherence refine here would brick an already-stored row
 *  on read, so `from <= to` is checked where a span is accepted as input ({@link importWindowSchema}). */
export const storedImportWindowSchema = z.strictObject({
  from: z.number().int().nonnegative(),
  to: z.number().int().nonnegative(),
}) satisfies z.ZodType<ImportWindow>;

/** The span as a run's input: a span that ends before it starts is refused. */
export const importWindowSchema = storedImportWindowSchema.refine(
  (window) => window.from <= window.to,
  "an import window ends at or after it starts",
) satisfies z.ZodType<ImportWindow>;

/** The span covering both windows. Two imports' spans merge into one offer; any other chat the same owner imported
 *  in between is in scope too, which is the owner's own library. */
export function mergeImportWindows(a: ImportWindow, b: ImportWindow): ImportWindow {
  return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
}

/** memory-backfill: `importWindow` narrows the sweep to the chats an import wrote, intersected with the row's
 *  enumeration scope (absent = every chat in scope); the sweep never widens. `segmentsOnly` builds the free
 *  verbatim-segment embeddings and no digest, so it makes no Utility-model call: an import enqueues that pass
 *  itself, and offers the digest build behind the model-run confirm. `embedderChanged` marks the whole-corpus
 *  rebuild an embedder change queued. */
export const memoryBackfillWorkloadParams = z.object({
  importWindow: importWindowSchema.optional(),
  segmentsOnly: z.boolean().optional(),
  embedderChanged: z.boolean().optional(),
});
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
