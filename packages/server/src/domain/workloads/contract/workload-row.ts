// domain/workloads/contract/workload-row — the typed DB-row projection WorkloadRowAnyKind: per-kind
// narrowing of the Drizzle unknown JSON columns (params/result) against the kind discriminator. One place
// does the narrowing (persistence/toView), so no consumer casts the JSON blobs.

import type { WorkloadKind, WorkloadMode, WorkloadParamsByKind, WorkloadResultByKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";

interface WorkloadRowBase {
  readonly id: WorkloadId;
  readonly status: WorkloadStatus;
  readonly mode: WorkloadMode;
  /** null for a scheduler/system row; SET NULL on user delete so the never-deleted audit row outlives the user. */
  readonly ownerId: UserId | null;
  /** Enforced by the scheduler: a non-empty dependsOn dispatches only once every dep succeeded; a dep hitting
   *  a non-success terminal fails the dependent with dependency_failed instead of running. */
  readonly dependsOn: readonly WorkloadId[] | null;
  readonly error: string | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

type WorkloadRow<K extends WorkloadKind> = WorkloadRowBase & {
  readonly kind: K;
  readonly params: WorkloadParamsByKind[K];
  readonly result: WorkloadResultByKind[K] | null;
};

/** A row whose kind isn't in this build narrows to nothing and is filtered as poison on the read path. */
export type WorkloadRowAnyKind = { [K in WorkloadKind]: WorkloadRow<K> }[WorkloadKind];
