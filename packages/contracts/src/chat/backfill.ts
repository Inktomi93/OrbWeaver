// `@orb/contracts/chat` — the terminal results of chat's two corpus-sweep workloads (the workloads
// junk-drawer exit: a workload's result shape is domain↔domain wire, authored by the OWNING domain).
// `memory-backfill` sweeps the memory subsystem's segments/digests; `group-character-backfill` mints the
// synthetic group character for every >1-character room that lacks one (D38).

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
