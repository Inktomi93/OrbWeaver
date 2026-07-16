// domain/workloads/engine/schedule-tick — the scheduler tick: find every `enabled` schedule with
// `next_run_at <= now`, enqueue each via the injected `start`, then advance it. A single-active collision
// is a benign skip (still advances); other domain errors log + advance (a poison schedule can't wedge the
// tick); a non-domain throw propagates to the driver's per-tick guard (no advance, retried next tick).

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainConflictError, DomainError } from "@orb/kit/errors";
import { getLog } from "#foundation/observability";
import type { ScheduleTickDeps, WorkloadScheduleRow } from "../contract/schedule";
import type { StartWorkloadInput } from "../contract/workload-params";
import { advanceSchedule, findDueSchedules } from "../persistence/schedule-queries";

const LOG_COMPONENT = "workload-schedule-tick";

/** Enqueue ONE schedule's workload, tolerating the benign single-active collision. */
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
      return;
    }
    if (err instanceof DomainError) {
      log.warn({ scheduleId: schedule.id, kind: schedule.kind, err: err.message }, "schedule-tick: enqueue rejected (advancing anyway)");
      return;
    }
    throw err;
  }
}

/** ONE tick: enqueue every due schedule + advance it. */
export async function tickWorkloadSchedules(deps: ScheduleTickDeps): Promise<void> {
  const due = await findDueSchedules(deps.db, deps.now());
  for (const schedule of due) {
    const at = deps.now();
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design — each start respects the single-active DB lock.
    await enqueueDue(deps, schedule);
    await advanceSchedule(deps.db, schedule.id, at + CADENCE_INTERVAL_MS[schedule.cadence], at);
  }
}
