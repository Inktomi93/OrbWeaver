// domain/workloads — front door: the only legal external import. Runners are not exported (reached only
// via engine/dispatch internally). Kind/status tuples live in @orb/contracts/workloads, not here — and since
// SSE-1 S5 so do `WorkloadEvent`/`WorkloadError`: the lifecycle events ride the multiplexed socket to the
// browser, so they are a WIRE contract, and a reader takes them from `@orb/contracts/workloads` directly
// rather than through this door (the bus PRODUCER, `emitWorkloadEvent`, is still ours).

export type { AnyWorkloadContribution, WorkloadContribution, WorkloadContributions } from "./contract/contribution.ts";
export type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./contract/params.ts";

export type {
  CreateScheduleParams,
  DeleteScheduleParams,
  ListSchedulesParams,
  ScheduleTickDeps,
  SetScheduleEnabledParams,
  UpdateScheduleParams,
  WorkloadScheduleRow,
  WorkloadScheduleService,
} from "./contract/schedule.ts";
export type { WorkloadRunnerDeps, WorkloadService, WorkloadServiceDeps } from "./contract/service.ts";
export type { WorkloadRowAnyKind, WorkloadRunnableRow } from "./contract/workload-row.ts";
export {
  emitWorkloadEvent,
  getRecentWorkloadEvents,
  subscribeWorkloadWake,
  workloadStreamEmitter,
} from "./engine/progress-bus.ts";
export { reapOrphanedWorkloads } from "./engine/reaper.ts";
export { runWorkload } from "./engine/runner.ts";
export { tickWorkloadSchedules } from "./engine/schedule-tick.ts";
export { loadWorkload, nextRunnableWorkload } from "./persistence/queries.ts";
export { createWorkloadService } from "./service.ts";
export { createReservedWorkloadContributions } from "./substrate/reserved-contributions.ts";
