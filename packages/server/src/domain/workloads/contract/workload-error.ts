// domain/workloads/contract/workload-error — the `WorkloadError` discriminated union (§7.5: one importable
// union, never re-spelled inline). Each arm has EXACTLY ONE producing site (the §7.5 "one producer per arm"
// discipline):
//   • `runtime`     — the runner threw; produced at the engine dispatch `catch` (engine/runner.ts).
//   • `cancelled`   — the run was aborted (admin cancel or SIGTERM); produced where the abort is observed.
//   • `worker_died` — an in-flight row's lease went stale; produced ONLY by the reaper (engine/reaper.ts).
// The removed `dependency_failed` arm is deliberately ABSENT: `dependsOn` is persisted-not-enforced (no
// producer), so an arm for it would be dead — re-add it only when a DAG scheduler lands
// (proposed/workloads-deferred-designs.md). The `kind` axis is the canonical `WORKLOAD_ERROR_KINDS` tuple.

/** The error-kind axis — ONE home (§7.5; the `WorkloadError.kind` discriminant + any tRPC wire schema
 *  derive from this tuple, no inline re-spell). */
export const WORKLOAD_ERROR_KINDS = ["runtime", "cancelled", "worker_died"] as const;
export type WorkloadErrorKind = (typeof WORKLOAD_ERROR_KINDS)[number];

/** A classified terminal-failure reason stamped on a row's `error` column + carried on the failed/cancelled
 *  bus event. `message` is the human-readable detail; `kind` is the single-producer discriminant above. */
export interface WorkloadError {
  readonly kind: WorkloadErrorKind;
  readonly message: string;
}
