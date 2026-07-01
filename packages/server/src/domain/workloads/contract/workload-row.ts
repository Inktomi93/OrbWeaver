// domain/workloads/contract/workload-row — the typed DB-row projection `WorkloadRowAnyKind`: the per-kind
// narrowing of the Drizzle `unknown` JSON columns (`params`/`result`) against the `kind` discriminator. ONE
// place does the narrowing (`persistence/toView`), so no consumer casts the JSON blobs; same pattern as
// chat's `LoadedChat`. The row is `@public` on the front door (tRPC get/list + the worker project it).
//
// HOME NOTE (born-compliant vs doc): workloads.md sketches this type living in `persistence/queries.ts`, but
// the `no-inline-types` grit flags ANY `export type` outside a type home — a persistence file is not one. So
// the TYPE homes here in `contract/` (the gate wins, core/Core-0-Architecture-and-Structure.md §7.4) and `persistence/` imports it; the
// front door re-exports it. The PROJECTION FUNCTION (`toView`) stays in `persistence/` (it touches the row).

import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { ParamsByKind } from "./workload-params";
import type { ResultByKind } from "./workload-result";

/** The kind-agnostic columns every workload row carries (the lifecycle + audit + queue-order fields). */
export interface WorkloadRowBase {
  readonly id: WorkloadId;
  readonly status: WorkloadStatus;
  /** The acting/triggering user (`null` for a scheduler/system row — the runner maps it to a synthetic id).
   *  SET NULL on user delete so the never-deleted audit row outlives the user. */
  readonly ownerId: UserId | null;
  /** Forward-compat DAG hint — PERSISTED but NOT ENFORCED (dispatch is `(status='queued', scheduledAt)`
   *  order; `start`/`retry` warn at the seam). `null` when no deps were supplied (esoteric #8). */
  readonly dependsOn: readonly WorkloadId[] | null;
  /** A human-readable terminal-failure reason (failed/worker_died); `null` otherwise. */
  readonly error: string | null;
  readonly scheduledAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** A single workload row narrowed to one kind — `params`/`result` typed by the discriminator. */
export type WorkloadRow<K extends WorkloadKind> = WorkloadRowBase & {
  readonly kind: K;
  readonly params: ParamsByKind[K];
  readonly result: ResultByKind[K] | null;
};

/** The typed row ANY consumer receives (a discriminated union over `kind`) — `toView` produces it; tRPC
 *  get/list + the worker driver project it. A row whose `kind` isn't in this build narrows to nothing and is
 *  filtered as poison on the read path (deploy-skew tolerance). */
export type WorkloadRowAnyKind = { [K in WorkloadKind]: WorkloadRow<K> }[WorkloadKind];
