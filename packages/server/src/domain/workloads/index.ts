// domain/workloads — front door: the only legal external import. Runners are not exported (reached only
// via engine/dispatch internally). Kind/status tuples live in @orb/contracts/workloads, not here — and since
// SSE-1 S5 so do `WorkloadEvent`/`WorkloadError`: the lifecycle events ride the multiplexed socket to the
// browser, so they are a WIRE contract, and a reader takes them from `@orb/contracts/workloads` directly
// rather than through this door (the bus PRODUCER, `emitWorkloadEvent`, is still ours).

export type { AnyWorkloadContribution, WorkloadContribution, WorkloadContributions } from "./contract/contribution";
export type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./contract/params";

export type {
  CreateScheduleParams,
  DeleteScheduleParams,
  ListSchedulesParams,
  ScheduleTickDeps,
  SetScheduleEnabledParams,
  UpdateScheduleParams,
  WorkloadScheduleRow,
  WorkloadScheduleService,
} from "./contract/schedule";
export type { WorkloadRunnerDeps, WorkloadService, WorkloadServiceDeps } from "./contract/service";
export type { WorkloadRowAnyKind, WorkloadRunnableRow } from "./contract/workload-row";
export {
  emitWorkloadEvent,
  getRecentWorkloadEvents,
  subscribeWorkloadWake,
  workloadStreamEmitter,
} from "./engine/progress-bus";
export { reapOrphanedWorkloads } from "./engine/reaper";
export { runWorkload } from "./engine/runner";
export { tickWorkloadSchedules } from "./engine/schedule-tick";
export { loadWorkload, nextRunnableWorkload } from "./persistence/queries";
export { createWorkloadService } from "./service";
export { createReservedWorkloadContributions } from "./substrate/reserved-contributions";
