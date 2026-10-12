import type { Principal } from "@orb/contracts/identity";
import type { StartWorkloadParams, WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";

export type { StartWorkloadParams } from "@orb/contracts/workloads";

// domain/workloads/contract/params — verb argument + result shapes. Every verb carries
// caller: Principal | null — the authorization subject the verb gates on. null = a trusted
// system/scheduler/agent-env trigger (no gate); a non-null caller is IDOR-scoped to their own ownerId
// unless admin. The row's stamped ownerId derives from the caller, or the explicit ownerId for a system trigger.

/** The call estimate asks about the same run `start` would admit, under the same mode and owner rules; the
 *  caller is always a person, because the estimate exists for a confirm a person reads. */
export interface EstimateModelCallsParams extends Pick<StartWorkloadParams, "input" | "mode" | "targetOwnerId"> {
  readonly caller: Principal;
  /** Count the run as if its owning domain would admit it. A run `start` would refuse is otherwise counted as 0
   *  calls; a confirm that precedes the switch which would admit it (turning Memory on) asks for the count anyway. */
  readonly assumeAdmitted?: boolean | undefined;
}

/** The call estimate for a retry: the row a retry would clone, counted under that row's own scope. */
export interface EstimateRetryModelCallsParams {
  readonly id: WorkloadId;
  readonly caller: Principal;
}

export interface CancelWorkloadParams {
  readonly id: WorkloadId;
  readonly caller: Principal | null;
}

export type { CancelWorkloadResult } from "@orb/contracts/workloads";

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
