// domain/workloads/contract/workload-error — the WorkloadError discriminated union. Each arm has exactly
// one producing site: runtime (engine dispatch catch), cancelled (abort observed), worker_died (reaper
// only), dependency_failed (the DAG scheduler predicate in persistence/queries.ts, which fails the
// dependent in place with no bus event since persistence is pure data access).

export const WORKLOAD_ERROR_KINDS = [
  "runtime",
  "cancelled",
  "worker_died",
  "dependency_failed",
] as const;
export type WorkloadErrorKind = (typeof WORKLOAD_ERROR_KINDS)[number];

export interface WorkloadError {
  readonly kind: WorkloadErrorKind;
  readonly message: string;
}
