import type { CatalogRefreshSchedulerDeps } from "../catalog-refresh-scheduler.ts";
import type { WorkloadScheduleSchedulerDeps } from "../workload-schedule-scheduler.ts";
import type { WorkloadsWorkerDeps } from "../workloads-worker.ts";

export interface ServiceJobsDeps {
  readonly catalog: CatalogRefreshSchedulerDeps;
  readonly schedule: WorkloadScheduleSchedulerDeps;
  readonly worker: Omit<WorkloadsWorkerDeps, "signal">;
}

/** The owned lifetime of the production schedulers and workload worker, started after boot recovery. */
export interface ServiceJobs extends AsyncDisposable {
  readonly start: () => void;
  readonly cancel: () => void;
}
