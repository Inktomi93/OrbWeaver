// `@orb/contracts/workloads` — the front door for the workload wire contracts. Split by concern (D15's
// directory-module law: internals flat, this index re-exports, consumer-invisible):
//   • axes.ts         — the canonical KIND/SOURCE/MODE/STATUS/CADENCE tuples `@orb/db` derives its enum
//                       columns + CHECKs from (D34), plus the per-kind mode policy
//   • params.ts       — the per-kind params schemas + `WorkloadParamsByKind` + the `start` wire input
//   • result.ts       — the per-kind terminal result shapes + `WorkloadResultByKind`
//   • execution.ts    — the DOM-free half of the contribution seam: the lane + resume axes, the progress
//                       snapshot, and the per-dispatch run context (the `WorkloadContribution` interface
//                       itself needs `AbortSignal` and homes at `domain/workloads/contract/contribution.ts`)
//
// `axes.ts` is the root of the directory-module: its siblings import it, it imports none of them.

export type { IndexSource, ScheduleCadence, WorkloadKind, WorkloadMode, WorkloadModePolicy, WorkloadSource, WorkloadStatus } from "./axes";
export {
  ACTIVE_WORKLOAD_STATUSES,
  CADENCE_INTERVAL_MS,
  INDEX_SOURCES,
  indexSourceSchema,
  NON_INDEX_SOURCE,
  SCHEDULE_CADENCES,
  scheduleCadenceSchema,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_SOURCES,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "./axes";
export type { ReportProgress, WorkloadLane, WorkloadProgress, WorkloadResumePolicy, WorkloadRunContext } from "./execution";
export { WORKLOAD_LANES, WORKLOAD_RESUME_POLICIES } from "./execution";
export type { NoWorkloadParams, StartWorkloadEnvelope, StartWorkloadInput, WorkloadParamsByKind } from "./params";
export {
  asStartWorkloadInput,
  databankIngestWorkloadParams,
  databankReindexWorkloadParams,
  emptyWorkloadParams,
  importBundleWorkloadParams,
  importStWorkloadParams,
  indexWorkloadParams,
  maintenanceWorkloadParams,
  startWorkloadEnvelope,
} from "./params";
export type { BundleImportWorkloadResult, DeferredResult, MaintenanceResult, WorkloadResultByKind } from "./result";
