// domain/workloads/contract/params — the verb argument + result shapes (one-home, §7.4; the doc sketched
// these on the verb files but `no-inline-types` forbids exported types outside a type home, so they live
// here and `verbs/*` import them).
//
// F3 (per-user workloads): every verb now carries `caller: Principal | null` — the AUTHORIZATION subject the
// verb gates on (server-authoritative, mirroring the admin double-gate), NOT merely an audit tag. `null` = a
// TRUSTED system/scheduler/agent-env trigger (no gate; the internal driver's concern). A non-null caller is a
// real request: a deployment-scope kind requires admin (`start`/`retry`), and read/mutate verbs are IDOR-scoped
// to the caller's own `ownerId` unless the caller is admin (owner∪admin sees all). The row's stamped `ownerId`
// derives from the caller (`caller.userId`) for a request, or the explicit `ownerId` for a system/agent trigger.

import type { Principal } from "@orb/contracts/identity";
import type { WorkloadKind, WorkloadMode, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { StartWorkloadInput } from "./workload-params";

/** `start` — enqueue a `queued` row in a given `mode`. `input` is re-parsed (defense-in-depth). AUTHORITY:
 *  `mode: "singular"` (default) is startable by any authed `caller` and stamps `ownerId = caller.userId` (a
 *  user's own one-owner run); `mode: "bulk"` requires the BOX OWNER (`requireOwner`) and either sweeps ALL
 *  owners (sweep-kind → `ownerId = null`) or mints INTO `targetOwnerId` (create-kind → `ownerId = target`;
 *  the kind's `bulkRequiresTarget` policy decides). `caller: null` = a TRUSTED system/scheduler/agent trigger
 *  — it bypasses the gate and stamps the explicit `ownerId`. `dependsOn` is persisted-not-enforced (a
 *  warn-seam); `scheduledAt` future-dates the dispatch order. */
export interface StartWorkloadParams {
  readonly input: StartWorkloadInput;
  readonly caller: Principal | null;
  readonly mode: WorkloadMode;
  /** The bulk-CREATE target user (the kind's `bulkRequiresTarget` policy demands it). Ignored in singular mode
   *  (always the caller's own owner) and by sweep-kind bulk (all owners). */
  readonly targetOwnerId?: UserId | null;
  /** The explicit owner for a `caller: null` (system/agent) trigger — the row owner when there is no Principal
   *  to derive it from. Ignored when `caller` is set (the caller's own id wins — server-authoritative). */
  readonly ownerId: UserId | null;
  readonly dependsOn?: readonly WorkloadId[];
  readonly scheduledAt?: number;
}

/** `cancel` — request a stop on one row by id. `caller` gates visibility: a non-admin caller cancelling a
 *  workload that isn't theirs sees a leak-free NOT_FOUND and NO state change (`caller: null` = system, any row). */
export interface CancelWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

/** The transition `cancel` actually effected: `cancelling` (a running row), `cancelled` (a queued row), or
 *  `null` (the row was already terminal — a no-op). The verb returns what happened; the engine aborts async. */
export interface CancelWorkloadResult {
  readonly status: "cancelling" | "cancelled" | null;
}

/** `retry` — clone a row's kind+params+dependsOn into a FRESH `queued` row (never mutates the original). The
 *  clone preserves the original's `ownerId` (it re-runs THAT owner's job). `caller` gates visibility (a
 *  non-admin can only retry a row it owns → else NOT_FOUND) and scope (a deployment-scope kind requires admin). */
export interface RetryWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

/** `get` — one typed row by id (throws `DomainNotFoundError` when absent OR not visible to a non-admin caller
 *  — the leak-free collapse: "missing" and "not yours" are one answer, never an existence oracle). */
export interface GetWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

/** `list` — filter by kind/status/owner/since (all optional), newest-first, hard-capped 500. A non-admin
 *  caller is FORCED to their own `ownerId` (any supplied owner filter is ignored — server-authoritative); an
 *  admin (or a `null` system caller) may filter by any owner or leave it unfiltered (the deployment-wide view). */
export interface ListWorkloadsParams {
  readonly caller: Principal | null;
  readonly kind?: WorkloadKind;
  readonly status?: WorkloadStatus;
  readonly ownerId?: UserId | null;
  readonly since?: number;
  readonly limit?: number;
}
