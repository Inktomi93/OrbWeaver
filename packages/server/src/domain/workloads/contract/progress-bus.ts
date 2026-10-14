import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";

export interface WorkloadProgressBus extends Disposable {
  readonly emitWorkloadEvent: (event: WorkloadEvent) => void;
  readonly getRecentWorkloadEvents: (workloadId: WorkloadId) => readonly WorkloadEvent[];
  readonly subscribeWorkloadWake: (listener: () => void) => () => void;
  readonly subscribeWorkloadEvents: (workloadId: WorkloadId, signal: AbortSignal) => AsyncIterable<WorkloadEvent>;
}
