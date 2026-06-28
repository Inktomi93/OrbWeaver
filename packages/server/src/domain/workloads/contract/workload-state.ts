// domain/workloads/contract/workload-state — the `WorkloadProgress` snapshot shape (the per-tick
// projection the engine reports onto the bus). The lifecycle-STATUS axis itself is NOT re-declared here:
// `WORKLOAD_STATUSES` / `WorkloadStatus` / `ACTIVE_WORKLOAD_STATUSES` are the D34 canonical tuples in
// `@orb/contracts/workloads` (promoted UP so `@orb/db` can derive its enum column) — internal files and the
// front door import them DOWN from there (no re-spell, §7.5; a re-export block here trips `noBarrelFile`,
// which is exempt only on `index.ts`). This file owns ONLY the domain-internal progress vocabulary, which
// homes in `contract/` per `no-inline-types`.

/**
 * The progress snapshot a runner reports per tick (engine → bus → SSE). Purely advisory observability — it
 * is NOT persisted as its own column (the `workloads` row carries no progress column; a report bumps the
 * heartbeat `updatedAt` and fans out on the bus). All fields optional so a runner reports only what it
 * knows: `message` (a human label), `current`/`total` (a count pair), `pct` (0–100 when computable).
 */
export interface WorkloadProgress {
  readonly message?: string;
  readonly current?: number;
  readonly total?: number;
  readonly pct?: number;
}

/** The callback a runner closes over to report a progress snapshot (engine-bound per dispatch). */
export type ReportProgress = (progress: WorkloadProgress) => void;
