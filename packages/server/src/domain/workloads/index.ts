// domain/workloads — front door: the only legal external import. Runners are not exported (reached only
// via engine/dispatch internally). Kind/status tuples live in @orb/contracts/workloads, not here — and since
// SSE-1 S5 so do `WorkloadEvent`/`WorkloadError`: the lifecycle events ride the multiplexed socket to the
// browser, so they are a WIRE contract, and a reader takes them from `@orb/contracts/workloads` directly
// rather than through this door (the bus PRODUCER, `emitWorkloadEvent`, is still ours).

export { WORKLOAD_NOT_ADMISSIBLE } from "@orb/contracts/workloads";
export type { AnyWorkloadContribution, WorkloadContribution, WorkloadContributions } from "./contract/contribution.ts";

export type { WorkloadProgressBus } from "./contract/progress-bus.ts";
export type { ScheduleTickAssemblyDeps as ScheduleTickDeps } from "./contract/schedule.ts";
export type {
  ReapWorkloadsAssemblyArgs as ReapWorkloadsArgs,
  WorkloadReapReason,
  WorkloadRunnerAssemblyDeps as WorkloadRunnerDeps,
  WorkloadService,
} from "./contract/service.ts";
export type { WorkloadRowAnyKind, WorkloadRunnableRow } from "./contract/workload-row.ts";
export { reclaimInFlightOnBoot } from "./engine/boot-reclaim.ts";
export { createWorkloadProgressBus } from "./engine/progress-bus.ts";
export { createWorkloadService } from "./service.ts";
export { createReservedWorkloadContributions } from "./substrate/reserved-contributions.ts";
export {
  createNextRunnableWorkload,
  loadWorkload,
  reapOrphanedWorkloads,
  runWorkload,
  tickWorkloadSchedules,
} from "./substrate/wiring.ts";
