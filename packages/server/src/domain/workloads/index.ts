// domain/workloads — front door: the only legal external import. Runners are not exported (reached only
// via engine/dispatch internally). Kind/status tuples live in @orb/contracts/workloads, not here.

export type { AnyWorkloadContribution, WorkloadContribution, WorkloadContributions } from "./contract/contribution";
export type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./contract/params";
export type { Runner } from "./contract/runner";

export type { WorkloadDatabankEnv, WorkloadEmbeddingsEnv, WorkloadImportEnv, WorkloadRunnerEnv, WorkloadStatsEnv } from "./contract/runner-env";
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
export type {
  ShimContributionDeps,
  WorkloadRunnerContext,
  WorkloadRunnerDeps,
  WorkloadService,
  WorkloadServiceDeps,
} from "./contract/service";
export type { WorkloadError } from "./contract/workload-error";
export type { WorkloadEvent } from "./contract/workload-events";
export type { WorkloadRowAnyKind } from "./contract/workload-row";
export {
  emitWorkloadEvent,
  getRecentWorkloadEvents,
  subscribeWorkloadEvents,
  subscribeWorkloadWake,
  workloadStreamEmitter,
} from "./engine/progress-bus";
export { reapOrphanedWorkloads } from "./engine/reaper";
export { runWorkload } from "./engine/runner";
export { tickWorkloadSchedules } from "./engine/schedule-tick";
export { loadWorkload, nextRunnableWorkload } from "./persistence/queries";
export { createWorkloadService } from "./service";
export { buildShimContributions } from "./substrate/shim-contributions";
