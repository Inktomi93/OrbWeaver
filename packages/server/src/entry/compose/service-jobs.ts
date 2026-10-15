// Bind the existing production job drivers; their scheduling, admission and workload decisions stay with their owners.

import type { UserId } from "@orb/kit/ids";
import type { TimerScheduler } from "@orb/kit/time";
import type { WorkloadProgressBus, WorkloadRunnerDeps } from "#domain/workloads";
import { createNextRunnableWorkload, loadWorkload, reapOrphanedWorkloads, runWorkload } from "#domain/workloads";
import type { BackgroundWork } from "#infra/tasks";
import type { ServiceJobs } from "#src/transport/jobs/contract/service-jobs.ts";
import { createServiceJobs } from "#src/transport/jobs/service-jobs.ts";
import type { Services } from "#transport/trpc";

type ServiceJobDeps = Pick<WorkloadRunnerDeps, "db" | "now" | "contributions" | "audit"> &
  Pick<BackgroundWork, "track" | "supervise"> & {
    readonly services: Pick<Services, "workloads" | "settings">;
    readonly ownerId: UserId | null;
    readonly timers: TimerScheduler;
    readonly progress: WorkloadProgressBus;
  };

/** Bind existing owners; transport owns startup state, cancellation and actual worker completion. */
export function buildServiceJobs(deps: ServiceJobDeps): ServiceJobs {
  const nextRunnable = createNextRunnableWorkload({ db: deps.db, contributions: deps.contributions, emitEvent: deps.progress.emitWorkloadEvent });
  return createServiceJobs({
    catalog: {
      service: deps.services.workloads,
      ownerId: deps.ownerId,
      now: deps.now,
      scheduleInterval: deps.timers.interval,
      refreshEveryMs: () => deps.services.settings.getEffectiveConfig().catalogRefreshIntervalMs,
      track: deps.track,
    },
    schedule: {
      db: deps.db,
      now: deps.now,
      start: (params) => deps.services.workloads.start(params),
      scheduleInterval: deps.timers.interval,
      track: deps.track,
    },
    worker: {
      track: deps.track,
      runnerDeps: {
        db: deps.db,
        now: deps.now,
        contributions: deps.contributions,
        audit: deps.audit,
        emitEvent: deps.progress.emitWorkloadEvent,
        scheduleInterval: deps.timers.interval,
      },
      nextRunnable: (_db, _contributions, now, lane) => nextRunnable(now, lane),
      run: runWorkload,
      reap: reapOrphanedWorkloads,
      load: loadWorkload,
      subscribeWake: deps.progress.subscribeWorkloadWake,
      scheduleInterval: deps.timers.interval,
      scheduleTimeout: deps.timers.timeout,
      supervise: deps.supervise,
    },
  });
}
