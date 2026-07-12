// workloads-run-model — the run dialog's DEFERRAL + DAG vocabulary (the `scheduledAt` one-off-at-time-T
// control and the `dependsOn` gate), plus the queue-state derivations the LIST renders for them. Split out
// of workloads-model.ts to keep that file under the §2.1 size cap. DOM-free (node-testable). Depends only on
// the `@orb/contracts/workloads` status axis — imports NOTHING from workloads-model (one direction).
//
// The server has NO distinct status for these states: a deferred run is `queued` with `scheduledAt`
// future-dated; a dep-gated run is `queued` with a non-empty `dependsOn`; a `dependency_failed` terminal is
// `failed` carrying the DAG message (the row exposes no error-KIND column, only the string). Each is derived
// here so the row can render the state distinctly from a plain queued/running row or a normal failure.

import type { WorkloadStatus } from "@orb/contracts/workloads";

/** Parse the run dialog's `datetime-local` string into an epoch-ms `scheduledAt`, or `undefined` when
 *  empty/unparseable (run now — the field is then omitted from the start payload). `Date.parse` (a pure
 *  parse of an explicit value, not an ambient clock read) resolves the tz-less local string. */
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

/** A deferred run's `scheduledAt` sits clearly past its `createdAt`; a normal run's default `scheduledAt`
 *  (≈ insert-now) does not. The lead threshold that separates them — clock-free, so the derivation is
 *  deterministic (node-testable) and doesn't need an ambient `now`. */
const DEFER_LEAD_MS = 60_000;

/** A future-dated run that hasn't fired yet — still `queued`, `scheduledAt` well past `createdAt`. */
export function isDeferredWorkload(row: {
  readonly status: WorkloadStatus;
  readonly scheduledAt: number;
  readonly createdAt: number;
}): boolean {
  return row.status === "queued" && row.scheduledAt - row.createdAt > DEFER_LEAD_MS;
}

/** A run blocked on its DAG gate — `queued` with a non-empty `dependsOn` (waits until every dep succeeds). */
export function isWaitingOnDependencies(row: {
  readonly status: WorkloadStatus;
  readonly dependsOn: readonly string[] | null;
}): boolean {
  return row.status === "queued" && row.dependsOn !== null && row.dependsOn.length > 0;
}

/** The waiting detail line — "Waiting on N dependencies" (singular/plural). */
export function dependencyWaitLabel(count: number): string {
  return `Waiting on ${count} ${count === 1 ? "dependency" : "dependencies"}`;
}

/** The distinctive fragment of the server's `dependency_failed` message (domain/workloads persistence
 *  `DEPENDENCY_FAILED_MESSAGE`). The row exposes only the message string (no error-kind column), so the
 *  client keys on this phrase — the same substring approach as `friendlyWorkloadError`. */
const DEPENDENCY_FAILURE_MARKER = "a dependency did not succeed";

/** Whether a failed row's error is the DAG `dependency_failed` terminal (it never ran because a dep didn't
 *  succeed) — distinct from a normal runtime failure, so the row can label it apart. */
export function isDependencyFailure(error: string | null): boolean {
  return error !== null && error.toLowerCase().includes(DEPENDENCY_FAILURE_MARKER);
}
