// domain/workloads/contract/workload-events — the WorkloadEvent bus union. Every event carries a non-empty
// workloadId (emitWorkloadEvent throws defensively on an empty id) plus kind and at (the injected-clock
// epoch-ms — not Date.now(); the replay buffer's TTL is measured in this same event-time domain).

import type { WorkloadKind, WorkloadStatus } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadError } from "./workload-error";
import type { WorkloadProgress } from "./workload-state";

interface WorkloadEventBase {
  readonly workloadId: WorkloadId;
  readonly kind: WorkloadKind;
  readonly at: number;
}

export type WorkloadEvent =
  | (WorkloadEventBase & { readonly type: "started" })
  | (WorkloadEventBase & { readonly type: "progress"; readonly progress: WorkloadProgress })
  | (WorkloadEventBase & { readonly type: "status"; readonly status: WorkloadStatus })
  | (WorkloadEventBase & { readonly type: "succeeded"; readonly result: unknown })
  | (WorkloadEventBase & { readonly type: "failed"; readonly error: WorkloadError })
  | (WorkloadEventBase & { readonly type: "cancelled" });
