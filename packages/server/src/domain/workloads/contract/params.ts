// domain/workloads/contract/params — the verb argument + result shapes (one-home, §7.4; the doc sketched
// these on the verb files but `no-inline-types` forbids exported types outside a type home, so they live
// here and `verbs/*` import them). `userId`/`ownerId` is threaded for audit + the F3 per-user hook but is
// NOT yet an authorization input (every verb is `adminProcedure`-gated; workloads are deployment-global —
// §7.1). `null` ownerId = a scheduler/system trigger.

import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { StartWorkloadInput } from "./workload-params";

/** `start` — enqueue a `queued` row. `input` is re-parsed (defense-in-depth); `ownerId` is the acting user
 *  (`null` = system/scheduler). `dependsOn` is persisted-not-enforced (a warn-seam); `scheduledAt` future-
 *  dates the dispatch order key (defaults to now). */
export interface StartWorkloadParams {
  readonly input: StartWorkloadInput;
  readonly ownerId: UserId | null;
  readonly dependsOn?: readonly WorkloadId[];
  readonly scheduledAt?: number;
}

/** `cancel` — request a stop on one row by id. `ownerId` is the audit subject (not an authz input yet). */
export interface CancelWorkloadParams {
  readonly id: WorkloadId;
  readonly ownerId: UserId | null;
}

/** The transition `cancel` actually effected: `cancelling` (a running row), `cancelled` (a queued row), or
 *  `null` (the row was already terminal — a no-op). The verb returns what happened; the engine aborts async. */
export interface CancelWorkloadResult {
  readonly status: "cancelling" | "cancelled" | null;
}

/** `retry` — clone a row's kind+params+dependsOn into a FRESH `queued` row (never mutates the original). */
export interface RetryWorkloadParams {
  readonly id: WorkloadId;
  readonly ownerId: UserId | null;
}

/** `get` — one typed row by id (throws `DomainNotFoundError` when absent). */
export interface GetWorkloadParams {
  readonly id: WorkloadId;
  readonly ownerId: UserId | null;
}

/** `list` — filter by kind/status/owner/since (all optional), newest-first, hard-capped 500. */
export interface ListWorkloadsParams {
  readonly kind?: WorkloadKind;
  readonly status?: WorkloadStatus;
  readonly ownerId?: UserId | null;
  readonly since?: number;
  readonly limit?: number;
}
