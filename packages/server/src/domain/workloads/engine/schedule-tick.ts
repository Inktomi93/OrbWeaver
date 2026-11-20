// domain/workloads/engine/schedule-tick — the scheduler tick: find every `enabled` schedule with
// `next_run_at <= now`, enqueue each via the injected `start`, then advance it. A single-active collision
// is a benign skip (still advances); other domain refusals log + advance (a poison schedule can't wedge the
// tick); a non-domain throw or an internal fault is a bug, not a refusal, so it propagates to the driver's
// per-tick guard (no advance, retried next tick).

import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { CADENCE_INTERVAL_MS, WORKLOAD_RUN_ACCOUNT_DISABLED } from "@orb/contracts/workloads";
import { DomainConflictError, DomainError, DomainInternalFaultError, DomainOperationError } from "@orb/kit/errors";
import { getLog } from "#foundation/observability";
import type { ScheduleTickDeps, WorkloadScheduleRow } from "../contract/schedule.ts";
import { advanceSchedule, findDueSchedules } from "../persistence/schedule-queries.ts";

const LOG_COMPONENT = "workload-schedule-tick";

/** Enqueue ONE schedule's workload, tolerating the benign single-active collision. Answers whether the tick may
 *  advance the schedule: a schedule whose account is disabled stays due, exactly as a paused one does, so the next
 *  tick after a re-enable admits it once and the runs it missed are not back-filled. */
async function enqueueDue(deps: ScheduleTickDeps, schedule: WorkloadScheduleRow): Promise<boolean> {
  const log = getLog(deps.logger).child({ component: LOG_COMPONENT });
  const input = { kind: schedule.kind, params: schedule.params } as StartWorkloadInput;
  try {
    await deps.start({
      input,
      caller: null,
      funderUserId: schedule.ownerId,
      mode: schedule.mode,
      ownerId: schedule.ownerId,
      targetOwnerId: schedule.ownerId,
    });
  } catch (err) {
    if (err instanceof DomainConflictError) {
      return true;
    }
    if (err instanceof DomainOperationError && err.code === WORKLOAD_RUN_ACCOUNT_DISABLED) {
      return false;
    }
    if (err instanceof DomainError && !(err instanceof DomainInternalFaultError)) {
      log.warn({ scheduleId: schedule.id, kind: schedule.kind, err: err.message }, "schedule-tick: enqueue rejected (advancing anyway)");
      return true;
    }
    throw err;
  }
  return true;
}

/** ONE tick: enqueue every due schedule + advance it. */
export async function tickWorkloadSchedules(deps: ScheduleTickDeps): Promise<void> {
  const due = await findDueSchedules(deps.db, deps.now());
  for (const schedule of due) {
    const at = deps.now();
    if (await enqueueDue(deps, schedule)) {
      await advanceSchedule(deps.db, schedule.id, at + CADENCE_INTERVAL_MS[schedule.cadence], at);
    }
  }
}
