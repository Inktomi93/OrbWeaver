// transport/jobs/workload-schedule-scheduler — the WHEN-to-tick DRIVER for recurring schedules (the TIME
// dimension over the queue). The decision + enqueue LOGIC is the injected `tick` (the workloads front door's
// `tickWorkloadSchedules`, wired at entry/); this driver only fires it at boot + on the injected interval, guarding
// errors so one bad tick never takes the process down (the next tick retries). Single-replica (the
// `orb/assumes-single-replica` stance): a per-process interval — the DB single-active lock makes a cross-replica
// double-enqueue benign regardless.
//
// BOUNDARIES: the driver imports only types from the workloads front door. The tick, the db, the clock, `start`,
// and the timer are ALL injected at entry/ — the driver constructs nothing.

import type { DatabaseHandle } from "@orb/db/wiring";
import { MS_PER_MINUTE } from "@orb/kit/time";
import type { ScheduleTickDeps } from "#domain/workloads";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { BackgroundWork } from "#infra/tasks";

const LOG_COMPONENT = "workload-schedule-scheduler";

// The decision cadence — how often the tick scans for due schedules. A minute is fine: the finest schedule
// cadence is hourly, so a minute of latency on "due" is negligible, and the scan is one indexed select.
const DEFAULT_CHECK_INTERVAL_MS = MS_PER_MINUTE;

/** A timer seam (entry wires `setInterval`; tests pass a synchronous fake). Returns a `clear` closure. */
type ScheduleOp = (fn: () => void, ms: number) => () => void;
// `tickWorkloadSchedules` — advance every due schedule and enqueue its workload (front door).
type TickSchedulesOp = (deps: ScheduleTickDeps) => Promise<void>;

/** The DI bundle the scheduler driver closes over — the tick op and its deps (db + clock + `start`) + the
 *  timer, all injected at entry/. */
export interface WorkloadScheduleSchedulerDeps {
  readonly logger: Logger;
  readonly track?: BackgroundWork["track"];
  readonly tick: TickSchedulesOp;
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
  // Built per line: a child copies the root's level when built, so one made at start would miss a later override.
  const log = (): Logger => getLog(deps.logger).child({ component: LOG_COMPONENT });
  const checkMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const tickDeps: ScheduleTickDeps = { logger: deps.logger, db: deps.db, now: deps.now, start: deps.start };

  const safeTick = (): void => {
    const completion = deps.tick(tickDeps).catch((err: unknown) => {
      log().error({ err }, "schedule-scheduler: tick failed (next tick retries)");
    });
    deps.track?.(completion);
  };

  safeTick();
  return deps.scheduleInterval(safeTick, checkMs);
}
