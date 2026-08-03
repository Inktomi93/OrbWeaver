// `@orb/contracts/workloads` — the front door for the workload wire contracts. Split by concern (D15's
// directory-module law: internals flat, this index re-exports, consumer-invisible):
//   • axes.ts         — the canonical KIND/MODE/STATUS/CADENCE tuples `@orb/db` derives its enum
//                       columns + CHECKs from (D34), the per-kind mode policy, and the admission-key
//                       sentinel (the lock partition is a free-form KEY, not an axis — see below)
//   • events.ts       — the lifecycle EVENT union + its failure shape: what the `workloads` room delivers on
//                       the multiplexed socket (SSE-1 S5), which is why it is a wire contract and not a
//                       domain-internal one
//   • params.ts       — the per-kind params schemas + `WorkloadParamsByKind` + the `start` wire input
//   • result.ts       — the per-kind terminal result shapes + `WorkloadResultByKind`
//   • execution.ts    — the DOM-free half of the contribution seam: the lane + resume axes, the progress
//                       snapshot, and the per-dispatch run context (the `WorkloadContribution` interface
//                       itself needs `AbortSignal` and homes at `domain/workloads/contract/contribution.ts`)
//
// `axes.ts` is the root of the directory-module: its siblings import it, it imports none of them.

export type { IndexSource, ScheduleCadence, WorkloadKind, WorkloadMode, WorkloadModePolicy, WorkloadStatus } from "./axes.ts";
export {
  ACTIVE_WORKLOAD_STATUSES,
  CADENCE_INTERVAL_MS,
  DEFAULT_ADMISSION_KEY,
  INDEX_SOURCES,
  indexSourceSchema,
  SCHEDULE_CADENCES,
  scheduleCadenceSchema,
  WORKLOAD_KIND_MODES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_STATUSES,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "./axes.ts";
export type { WorkloadError, WorkloadEvent } from "./events.ts";
export type { ReportProgress, WorkloadLane, WorkloadProgress, WorkloadResumePolicy, WorkloadRunContext } from "./execution.ts";
export { WORKLOAD_LANES, WORKLOAD_RESUME_POLICIES } from "./execution.ts";
export type { NoWorkloadParams, StartWorkloadEnvelope, StartWorkloadInput, WorkloadParamsByKind } from "./params.ts";
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
} from "./params.ts";
export type { BundleImportWorkloadResult, DeferredResult, MaintenanceResult, WorkloadResultByKind } from "./result.ts";
