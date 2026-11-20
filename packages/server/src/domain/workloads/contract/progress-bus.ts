import type { WorkloadEvent } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";

export interface WorkloadProgressBus extends Disposable {
  readonly emitWorkloadEvent: (event: WorkloadEvent) => void;
  readonly getRecentWorkloadEvents: (workloadId: WorkloadId) => readonly WorkloadEvent[];
  readonly subscribeWorkloadWake: (listener: () => void) => () => void;
  readonly subscribeWorkloadEvents: (workloadId: WorkloadId, signal: AbortSignal) => AsyncIterable<WorkloadEvent>;
  /** The runner registers the abort of a run in flight in this process, and calls the returned release when it settles. */
  readonly trackWorkloadRun: (workloadId: WorkloadId, abort: () => void) => () => void;
  /** Abort that run now, without waiting for the runner's status poll. False when no such run is in flight here. */
  readonly abortWorkloadRun: (workloadId: WorkloadId) => boolean;
}
