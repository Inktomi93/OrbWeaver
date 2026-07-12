// domain/workloads/contract/workload-error — the `WorkloadError` discriminated union (§7.5: one importable
// union, never re-spelled inline). Each arm has EXACTLY ONE producing site (the §7.5 "one producer per arm"
// discipline):
//   • `runtime`           — the runner threw; produced at the engine dispatch `catch` (engine/runner.ts).
//   • `cancelled`         — the run was aborted (admin cancel or SIGTERM); produced where the abort is observed.
//   • `worker_died`       — an in-flight row's lease went stale; produced ONLY by the reaper (engine/reaper.ts).
//   • `dependency_failed` — a queued row's `dependsOn` reached a NON-success terminal (a dep failed/cancelled/
//     worker_died, or is absent) so the dependent can never run; produced ONLY by the DAG scheduler predicate
//     (`persistence/queries.ts` `nextRunnableWorkload`), which fails the dependent in place (queued → failed)
//     the same way it fails a poison head row — no bus event, because persistence is pure data access (a
//     subscriber observes the terminal via list/get). This is the §2 DAG-scheduler arm
//     (history/workloads-deferred-designs.md), re-added now that `dependsOn` is ENFORCED. The `kind` axis is
//     the canonical `WORKLOAD_ERROR_KINDS` tuple.

/** The error-kind axis — ONE home (§7.5; the `WorkloadError.kind` discriminant + any tRPC wire schema
 *  derive from this tuple, no inline re-spell). */
export const WORKLOAD_ERROR_KINDS = [
  "runtime",
  "cancelled",
  "worker_died",
  "dependency_failed",
] as const;
export type WorkloadErrorKind = (typeof WORKLOAD_ERROR_KINDS)[number];

/** A classified terminal-failure reason stamped on a row's `error` column + carried on the failed/cancelled
 *  bus event. `message` is the human-readable detail; `kind` is the single-producer discriminant above. */
export interface WorkloadError {
  readonly kind: WorkloadErrorKind;
  readonly message: string;
}
