// domain/workloads — FRONT DOOR: the only legal external import. The worker + scheduler + buddy observer +
// tRPC router enter HERE (the `drivers-through-domain` rule); the runners are NOT exported (reached only by
// `engine/dispatch` internally). The kind/status TUPLES are NOT re-declared here — their D34 canonical home
// is `@orb/contracts/workloads` (so `@orb/db` can derive its enum columns); callers (tRPC, etc.) import the
// tuples from there directly. This door re-exports the domain's richer per-kind machinery + the engine entry
// points + the verb surface.

// Verb param/result types (the tRPC router types against these)
export type {
  CancelWorkloadParams,
  CancelWorkloadResult,
  GetWorkloadParams,
  ListWorkloadsParams,
  RetryWorkloadParams,
  StartWorkloadParams,
} from "./contract/params";
export type { Runner } from "./contract/runner";

// The cross-feature composition seam (entry/ builds the runtime value from these types)
export type {
  WorkloadAssetsEnv,
  WorkloadCharacterEnv,
  WorkloadConnectionEnv,
  WorkloadDiscoveryEnv,
  WorkloadEmbeddingsEnv,
  WorkloadImportEnv,
  WorkloadMemoryEnv,
  WorkloadRunnerEnv,
  WorkloadStatsEnv,
} from "./contract/runner-env";
export type {
  WorkloadRunnerContext,
  WorkloadRunnerDeps,
  WorkloadService,
  WorkloadServiceDeps,
} from "./contract/service";
export type { WorkloadError } from "./contract/workload-error";
export type { WorkloadEvent } from "./contract/workload-events";
export type { ParamsByKind, StartWorkloadInput } from "./contract/workload-params";
export { startWorkloadInput } from "./contract/workload-params";
export type { ResultByKind } from "./contract/workload-result";
export type { WorkloadRowAnyKind } from "./contract/workload-row";
// The kind/state/error/event vocabularies (the per-kind machinery + the progress/params/result shapes;
// the tRPC wire enums derive from the @orb/contracts/workloads tuples, imported there directly).
export type { WorkloadProgress } from "./contract/workload-state";
export {
  emitWorkloadEvent,
  getRecentWorkloadEvents,
  subscribeWorkloadWake,
  workloadStreamEmitter,
} from "./engine/progress-bus";
export { reapOrphanedWorkloads } from "./engine/reaper";
// Engine entry points (the transport/jobs worker DRIVER is the only legal external caller — front-door only)
export { runWorkload } from "./engine/runner";
// The typed row + queue poll the worker driver + tRPC get/list project (@public).
export { loadWorkload, nextRunnableWorkload } from "./persistence/queries";
// Service + factory + DI bundle types
export { createWorkloadService } from "./service";
