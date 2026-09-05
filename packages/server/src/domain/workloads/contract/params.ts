// domain/workloads/contract/params — verb argument + result shapes. Every verb carries
// caller: Principal | null — the authorization subject the verb gates on. null = a trusted
// system/scheduler/agent-env trigger (no gate); a non-null caller is IDOR-scoped to their own ownerId
// unless admin. The row's stamped ownerId derives from the caller, or the explicit ownerId for a system trigger.

import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadInput, WorkloadKind, WorkloadMode, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";

/** mode: "bulk" requires the box owner and either sweeps all owners or mints into targetOwnerId; caller:
 *  null bypasses the gate and stamps the explicit ownerId. */
export interface StartWorkloadParams {
  readonly input: StartWorkloadInput;
  readonly caller: Principal | null;
  readonly mode: WorkloadMode;
  readonly targetOwnerId?: UserId | null;
  readonly ownerId: UserId | null;
  readonly dependsOn?: readonly WorkloadId[];
  readonly scheduledAt?: number;
  /** "Start this unit, or hand me the run that already holds its slot." A caller whose next act needs an
   *  ACTIVE workload of this unit — a DAG builder that must chain a dependent on it — cannot use the bare
   *  conflict: `DomainConflictError` says the work is in flight but not WHICH row is doing it, so the only
   *  thing it can do is swallow the refusal and lose the edge. With this set, the single-active collision
   *  resolves to the ACTIVE row's id instead of throwing, and the caller's `dependsOn` survives whether this
   *  call created the row or found it. NOT the wire's to send — it is an internal/system-trigger intent, and
   *  the transport `start` proc does not carry it: a person clicking "Run" is told the run is already going,
   *  which is the honest answer for a person. `dependsOn`/`scheduledAt` supplied alongside an ADOPTED row are
   *  necessarily dropped — the adopted row was admitted under its own. Absent ⇒ the conflict throws. */
  readonly adoptActive?: boolean;
}

export interface CancelWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

export interface CancelWorkloadResult {
  readonly status: "cancelling" | "cancelled" | null;
}

export interface RetryWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

export interface GetWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

/** A non-admin caller is forced to their own ownerId (any supplied owner filter is ignored). */
export interface ListWorkloadsParams {
  readonly caller: Principal | null;
  readonly kind?: WorkloadKind;
  readonly status?: WorkloadStatus;
  readonly ownerId?: UserId | null;
  readonly since?: number;
  readonly limit?: number;
}
