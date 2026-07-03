// domain/workloads/contract/workload-events — the `WorkloadEvent` bus union (§7.5: one importable union;
// the SSE subscription + the buddy observer fan out from `engine/progress-bus`). EVERY event carries a
// non-empty `workloadId` (the subscription filters on it — `emitWorkloadEvent` throws defensively on an
// empty id) plus `kind` and `at` (the injected-clock epoch-ms the
// event was stamped — NOT `Date.now()`; the replay buffer's TTL is measured in this same event-time domain,
// so the bus needs no ambient clock).
//
// The arms mirror the lifecycle: `started` (claimed → running), `progress` (a per-tick snapshot), `status`
// (a raw status transition, e.g. → cancelling), `succeeded` (terminal + result), `failed` (terminal +
// error), `cancelled` (terminal). The `type` axis is the canonical `WORKLOAD_EVENT_TYPES` tuple.

import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadError } from "./workload-error";
import type { WorkloadProgress } from "./workload-state";

/** The bus event-type axis — ONE home (§7.5). */
export const WORKLOAD_EVENT_TYPES = [
  "started",
  "progress",
  "status",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type WorkloadEventType = (typeof WORKLOAD_EVENT_TYPES)[number];

/** Fields every bus event carries (the subscription filters on `workloadId`; `at` is the injected-clock
 *  stamp, the replay-TTL domain). */
interface WorkloadEventBase {
  readonly workloadId: WorkloadId;
  readonly kind: WorkloadKind;
  readonly at: number;
}

/** The lifecycle/observability bus union — discriminated on `type` (one producer per arm; see the engine). */
export type WorkloadEvent =
  | (WorkloadEventBase & { readonly type: "started" })
  | (WorkloadEventBase & { readonly type: "progress"; readonly progress: WorkloadProgress })
  | (WorkloadEventBase & { readonly type: "status"; readonly status: WorkloadStatus })
  | (WorkloadEventBase & { readonly type: "succeeded"; readonly result: unknown })
  | (WorkloadEventBase & { readonly type: "failed"; readonly error: WorkloadError })
  | (WorkloadEventBase & { readonly type: "cancelled" });
