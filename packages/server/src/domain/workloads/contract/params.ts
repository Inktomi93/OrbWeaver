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
