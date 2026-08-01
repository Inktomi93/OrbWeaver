// `@orb/contracts/chat` — the terminal results of chat's two corpus-sweep workloads (the workloads
// junk-drawer exit: a workload's result shape is domain↔domain wire, authored by the OWNING domain).
// `memory-backfill` sweeps the memory subsystem's segments/digests; `group-character-backfill` mints the
// synthetic group character for every >1-character room that lacks one (PD-41/D38).

/** A backfill sweep's counts: rows examined, rows changed. Shared by both sweeps. */
export interface BackfillPassResult {
  readonly scanned: number;
  readonly changed: number;
}

export interface MemoryBackfillResult {
  readonly segments: BackfillPassResult;
  readonly digests: BackfillPassResult;
  /** Chats whose per-chat build threw an UNEXPECTED error and were isolated-and-skipped. A non-silent
   *  skip: the sweep survives one bad chat, but the failure lands in the durable result JSON (and an
   *  `error`-level log), never vanishing without a trace. */
  readonly failed: number;
}
