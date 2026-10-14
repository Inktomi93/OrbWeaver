// Own the existing scheduler/worker lifetimes; their business and dispatch decisions stay in their drivers.

import { getLog } from "#foundation/observability";
import { startCatalogRefreshScheduler } from "./catalog-refresh-scheduler.ts";
import type { ServiceJobs, ServiceJobsDeps } from "./contract/service-jobs.ts";
import { startWorkloadScheduleScheduler } from "./workload-schedule-scheduler.ts";
import { startWorkloadsWorker } from "./workloads-worker.ts";

/** Start after boot seeds/reclaim; cancellation precedes joining the real worker, even when a timer clear fails. */
export function createServiceJobs(deps: ServiceJobsDeps): ServiceJobs {
  const clears = new DisposableStack();
  const workerAbort = new AbortController();
  let workerSettled = Promise.resolve();
  let started = false;
  let closed = false;
  let disposal: Promise<void> | undefined;
  const cancel = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    workerAbort.abort();
    clears.dispose();
  };
  return {
    cancel,
    start(): void {
      if (closed) {
        throw new Error("service jobs are disposed");
      }
      if (started) {
        return;
      }
      started = true;
      clears.defer(startCatalogRefreshScheduler(deps.catalog));
      clears.defer(startWorkloadScheduleScheduler(deps.schedule));
      workerSettled = startWorkloadsWorker({ ...deps.worker, signal: workerAbort.signal }).catch((err: unknown) => {
        getLog().error({ err: err instanceof Error ? err.message : String(err) }, "workloads worker loop exited");
      });
    },
    [Symbol.asyncDispose](): Promise<void> {
      disposal ??= (async (): Promise<void> => {
        await using completion = new AsyncDisposableStack();
        completion.defer(() => workerSettled);
        cancel();
      })();
      return disposal;
    },
  };
}
