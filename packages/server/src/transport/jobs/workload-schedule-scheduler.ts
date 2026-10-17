// transport/jobs/workload-schedule-scheduler — the WHEN-to-tick DRIVER for recurring schedules (the TIME
// dimension over the queue). The decision + enqueue LOGIC is `tickWorkloadSchedules` (the domain front door);
// this driver only fires it at boot + on the injected interval, guarding errors so one bad tick never takes
// the process down (the next tick retries). Single-replica (the `assumes-single-replica` stance): a per-process
// interval — the DB single-active lock makes a cross-replica double-enqueue benign regardless.
//
// BOUNDARIES: the driver enters ONLY the workloads front door (`tickWorkloadSchedules`) + `start` (threaded
// into the tick deps). ONE feature, zero cross-feature composition. The db, the clock, `start`, and the timer
// are ALL injected at entry/ — the driver constructs nothing.

import type { DatabaseHandle } from "@orb/db/wiring";
import { MS_PER_MINUTE } from "@orb/kit/time";
import type { ScheduleTickDeps } from "#domain/workloads";
import { tickWorkloadSchedules } from "#domain/workloads";
import { getLog } from "#foundation/observability";
import type { BackgroundWork } from "#infra/tasks";

const LOG_COMPONENT = "workload-schedule-scheduler";

// @orb-waive no-vanity-alias(DEFAULT_CHECK_INTERVAL_MS): baselined when the gate widened; burn-down item 906.
// The decision cadence — how often the tick scans for due schedules. A minute is fine: the finest schedule
// cadence is hourly, so a minute of latency on "due" is negligible, and the scan is one indexed select.
const DEFAULT_CHECK_INTERVAL_MS = MS_PER_MINUTE;

/** A timer seam (entry wires `setInterval`; tests pass a synchronous fake). Returns a `clear` closure. */
type ScheduleOp = (fn: () => void, ms: number) => () => void;

// @orb-waive no-inline-package-interface(WorkloadScheduleSchedulerDeps): baselined when the gate landed; burn-down item 952.
/** The DI bundle the scheduler driver closes over — the tick deps (db + clock + `start`) + the timer, all
 *  injected at entry/. */
export interface WorkloadScheduleSchedulerDeps {
  readonly track?: BackgroundWork["track"];
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly start: ScheduleTickDeps["start"];
  readonly scheduleInterval: ScheduleOp;
  readonly checkIntervalMs?: number;
}

/**
 * Start the scheduler: one immediate boot tick (a due schedule fires as soon as the worker polls) + the
 * recurring decision tick on the injected timer. Returns the `clear` closure so entry's lifecycle tears the
 * timer down on shutdown. A tick error never takes the process down — it is logged and the next tick retries.
 */
export function startWorkloadScheduleScheduler(deps: WorkloadScheduleSchedulerDeps): () => void {
  const log = getLog().child({ component: LOG_COMPONENT });
  const checkMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const tickDeps: ScheduleTickDeps = { db: deps.db, now: deps.now, start: deps.start };

  const safeTick = (): void => {
    const completion = tickWorkloadSchedules(tickDeps).catch((err: unknown) => {
      log.error({ err }, "schedule-scheduler: tick failed (next tick retries)");
    });
    deps.track?.(completion);
  };

  safeTick();
  return deps.scheduleInterval(safeTick, checkMs);
}
