// domain/workloads/engine/schedule-tick — the SCHEDULER TICK: the periodic pass that turns due schedules into
// enqueued workloads (the TIME dimension over the queue). ONE step (`tickWorkloadSchedules`): find every
// `enabled` schedule with `next_run_at <= now`, enqueue each via the INJECTED `start` (so the run flows through
// the normal dispatch + the single-active lock + the DAG), then advance the schedule (`next_run_at = run +
// interval`, `last_run_at = run`).
//
// COLLISION TOLERANCE: if an enqueue would collide with an already-active same-(kind, owner[, source]) run, the
// single-active lock makes `start` throw `DomainConflictError` — that is a BENIGN skip (the desired end state
// is "one active run"), so the tick swallows it and STILL advances the schedule. Other domain errors (a bad
// mode/target on a misconfigured schedule) are logged + advanced (so a poison schedule can't wedge the tick);
// a non-domain throw (db down) propagates to the driver's per-tick guard (no advance → retried next tick).
//
// DETERMINISM: `now` + `start` are injected — no ambient clock, no cross-feature import. Single-replica (the
// `assumes-single-replica` stance): the tick is a per-process interval; the DB single-active lock is what makes
// a double-enqueue across replicas benign anyway.

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainConflictError, DomainError } from "@orb/kit/errors";
import { getLog } from "#foundation/observability";
import type { ScheduleTickDeps, WorkloadScheduleRow } from "../contract/schedule";
import type { StartWorkloadInput } from "../contract/workload-params";
import { advanceSchedule, findDueSchedules } from "../persistence/schedule-queries";

const LOG_COMPONENT = "workload-schedule-tick";

/** Enqueue ONE schedule's workload, tolerating the benign single-active collision. The stored `params` blob is
 *  re-assembled into a `StartWorkloadInput` (kind + params) that `start` re-validates. `caller: null` marks a
 *  trusted system trigger (bypasses the per-mode gate); `ownerId`/`targetOwnerId` = the schedule owner (singular
 *  stamps it; bulk sweep ignores it; bulk create mints into it). Returns nothing — the tick advances regardless. */
async function enqueueDue(deps: ScheduleTickDeps, schedule: WorkloadScheduleRow): Promise<void> {
  const log = getLog().child({ component: LOG_COMPONENT });
  const input = { kind: schedule.kind, params: schedule.params } as StartWorkloadInput;
  try {
    await deps.start({
      input,
      caller: null,
      mode: schedule.mode,
      ownerId: schedule.ownerId,
      targetOwnerId: schedule.ownerId,
    });
  } catch (err) {
    if (err instanceof DomainConflictError) {
      // A same-(kind, owner[, source]) run is already active — the single-active lock did its job. Skip +
      // advance (re-enqueuing would just conflict again; the desired "one active run" already holds).
      return;
    }
    if (err instanceof DomainError) {
      // A misconfigured schedule (unsupported mode, missing bulk target). Log + advance so it can't hot-loop.
      log.warn(
        { scheduleId: schedule.id, kind: schedule.kind, err: err.message },
        "schedule-tick: enqueue rejected (advancing anyway)",
      );
      return;
    }
    throw err; // a non-domain failure (db down) — let the driver's guard retry next tick (no advance).
  }
}

/**
 * ONE tick: enqueue every due schedule + advance it. The testable core — a test seeds a past-due schedule, a
 * frozen clock + a fake `start`, and asserts the enqueue fired and `next_run_at` advanced (or that a disabled
 * schedule was untouched, or a collision was a benign skip that still advanced).
 */
export async function tickWorkloadSchedules(deps: ScheduleTickDeps): Promise<void> {
  const due = await findDueSchedules(deps.db, deps.now());
  for (const schedule of due) {
    const at = deps.now();
    // biome-ignore lint/performance/noAwaitInLoops: schedules enqueue SEQUENTIALLY by design — each start must respect the single-active DB lock, and the volume is tiny (one pass over the due set); concurrency would race the lock for no benefit.
    await enqueueDue(deps, schedule);
    // biome-ignore lint/performance/noAwaitInLoops: the advance must follow its own enqueue (same reason).
    await advanceSchedule(deps.db, schedule.id, at + CADENCE_INTERVAL_MS[schedule.cadence], at);
  }
}
