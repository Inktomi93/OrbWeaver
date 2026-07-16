// workloads-run-model — the run dialog's deferral + DAG vocabulary (scheduledAt and the dependsOn gate),
// plus the queue-state derivations the list renders for them. DOM-free. The server has no distinct status
// for these states, so each is derived here from queued/failed + its fields.

import type { WorkloadStatus } from "@orb/contracts/workloads";

/** Parse the run dialog's `datetime-local` string into an epoch-ms `scheduledAt`, or `undefined` when empty/unparseable. */
export function parseRunAt(runAt: string): number | undefined {
  if (runAt === "") {
    return;
  }
  const ms = Date.parse(runAt);
  if (Number.isNaN(ms)) {
    return;
  }
  return ms;
}

// The lead threshold separating a deferred run from a normal run's ≈insert-now default — clock-free, so the derivation is deterministic.
const DEFER_LEAD_MS = 60_000;

/** A future-dated run that hasn't fired yet — still `queued`, `scheduledAt` well past `createdAt`. */
export function isDeferredWorkload(row: { readonly status: WorkloadStatus; readonly scheduledAt: number; readonly createdAt: number }): boolean {
  return row.status === "queued" && row.scheduledAt - row.createdAt > DEFER_LEAD_MS;
}

/** A run blocked on its DAG gate — `queued` with a non-empty `dependsOn` (waits until every dep succeeds). */
export function isWaitingOnDependencies(row: { readonly status: WorkloadStatus; readonly dependsOn: readonly string[] | null }): boolean {
  return row.status === "queued" && row.dependsOn !== null && row.dependsOn.length > 0;
}

/** The waiting detail line — "Waiting on N dependencies" (singular/plural). */
export function dependencyWaitLabel(count: number): string {
  return `Waiting on ${count} ${count === 1 ? "dependency" : "dependencies"}`;
}

// The row exposes only the message string (no error-kind column), so the client keys on this phrase.
const DEPENDENCY_FAILURE_MARKER = "a dependency did not succeed";

/** Whether a failed row's error is the DAG `dependency_failed` terminal, distinct from a normal runtime failure. */
export function isDependencyFailure(error: string | null): boolean {
  return error?.toLowerCase().includes(DEPENDENCY_FAILURE_MARKER) ?? false;
}
