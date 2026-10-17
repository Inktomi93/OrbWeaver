// Drivers retain inert DB identity; the workload owner alone opens its existing query context.
import type { WorkloadLane } from "@orb/contracts/workloads";
import type { DatabaseHandle, DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { WorkloadId } from "@orb/kit/ids";
import type { WorkloadContributions } from "../contract/contribution.ts";
import type { ScheduleTickDeps } from "../contract/schedule.ts";
import type { NextRunnableWorkload, NextRunnableWorkloadDeps, ReapWorkloadsArgs, WorkloadRunnerDeps } from "../contract/service.ts";
import type { AuthorizeWorkloadRead, WorkloadRowAnyKind, WorkloadRunnableRow } from "../contract/workload-row.ts";
import { createNextRunnableWorkload as bindNextRunnable, nextRunnableWorkload as nextRunnable } from "../engine/next-runnable.ts";
import { reapOrphanedWorkloads as reap } from "../engine/reaper.ts";
import { runWorkload as run } from "../engine/runner.ts";
import { tickWorkloadSchedules as tick } from "../engine/schedule-tick.ts";
import { loadWorkload as load } from "../persistence/queries.ts";

/** Bind the existing queue scanner and its durable failure publisher. */
export function createNextRunnableWorkload(input: DbAssemblyInput<NextRunnableWorkloadDeps>): NextRunnableWorkload {
  return bindNextRunnable({ ...input, db: databaseForOwner(input.db) });
}

/** Poll the same lane-scoped queue through its owning engine. */
export function nextRunnableWorkload(
  db: DatabaseHandle,
  contributions: WorkloadContributions,
  now: number,
  lane: WorkloadLane,
): Promise<WorkloadRunnableRow | null> {
  return nextRunnable(databaseForOwner(db), contributions, now, lane);
}

/** Preserve the runner's claim, lease, cancellation and settlement ownership. */
export function runWorkload(input: DbAssemblyInput<WorkloadRunnerDeps>, row: WorkloadRunnableRow, signal: AbortSignal): Promise<void> {
  return run({ ...input, db: databaseForOwner(input.db) }, row, signal);
}

/** Reap through the same status-guarded native owner operation. */
export function reapOrphanedWorkloads(input: DbAssemblyInput<ReapWorkloadsArgs>): Promise<number> {
  return reap({ ...input, db: databaseForOwner(input.db) });
}

/** Re-read the claimed row without giving its driver a query client. */
export function loadWorkload(
  db: DatabaseHandle,
  contributions: WorkloadContributions,
  id: WorkloadId,
  authorize?: AuthorizeWorkloadRead,
): Promise<WorkloadRowAnyKind | null> {
  return load(databaseForOwner(db), contributions, id, authorize);
}

/** Keep schedule advancement and enqueue failure handling inside the existing engine. */
export function tickWorkloadSchedules(input: DbAssemblyInput<ScheduleTickDeps>): Promise<void> {
  return tick({ ...input, db: databaseForOwner(input.db) });
}
