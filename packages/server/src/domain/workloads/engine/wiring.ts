// Drivers retain inert DB identity; the workload owner alone opens its existing query context.

import type { WorkloadRowAnyKind, WorkloadRunnableRow } from "@orb/contracts/workloads";
import type { BootDatabaseHandle, DatabaseHandle, DbAssemblyInput } from "@orb/db/wiring";
import { bootDatabaseForOwner, databaseForOwner } from "@orb/db/wiring-owner";
import type { WorkloadId } from "@orb/kit/ids";
import type { ScheduleTickDeps } from "../contract/schedule.ts";
import type {
  BootReclaimArgs,
  BootReclaimReport,
  NextRunnableWorkload,
  NextRunnableWorkloadDeps,
  ReapWorkloadsArgs,
  WorkloadRunnerDeps,
} from "../contract/service.ts";
import type { AuthorizeWorkloadRead, WorkloadReads } from "../contract/workload-row.ts";
import { loadWorkload as load } from "../persistence/queries.ts";
import { reclaimInFlightOnBoot as reclaim } from "./boot-reclaim.ts";
import { createNextRunnableWorkload as bindNextRunnable } from "./next-runnable.ts";
import { reapOrphanedWorkloads as reap } from "./reaper.ts";
import { runWorkload as run } from "./runner.ts";
import { tickWorkloadSchedules as tick } from "./schedule-tick.ts";

/** Bind the existing queue scanner and its durable failure publisher. */
export function createNextRunnableWorkload(input: DbAssemblyInput<NextRunnableWorkloadDeps>): NextRunnableWorkload {
  return bindNextRunnable({ ...input, db: databaseForOwner(input.db) });
}

/** Preserve the runner's claim, lease, cancellation and settlement ownership. */
export function runWorkload(input: DbAssemblyInput<WorkloadRunnerDeps>, row: WorkloadRunnableRow, signal: AbortSignal): Promise<void> {
  return run({ ...input, db: databaseForOwner(input.db) }, row, signal);
}

/** Reap through the same status-guarded native owner operation. */
export function reapOrphanedWorkloads(input: DbAssemblyInput<ReapWorkloadsArgs>): Promise<number> {
  return reap({ ...input, db: databaseForOwner(input.db) });
}

/** Boot disposes of orphans through the same status-guarded writes the reaper uses. */
export async function reclaimInFlightOnBoot(input: Omit<BootReclaimArgs, "db"> & { readonly db: BootDatabaseHandle }): Promise<BootReclaimReport> {
  return await reclaim({ ...input, db: bootDatabaseForOwner(input.db) });
}

/** Re-read the claimed row without giving its driver a query client. */
export function loadWorkload(db: DatabaseHandle, reads: WorkloadReads, id: WorkloadId, authorize?: AuthorizeWorkloadRead): Promise<WorkloadRowAnyKind | null> {
  return load(databaseForOwner(db), reads, id, authorize);
}

/** Keep schedule advancement and enqueue failure handling inside the existing engine. */
export function tickWorkloadSchedules(input: DbAssemblyInput<ScheduleTickDeps>): Promise<void> {
  return tick({ ...input, db: databaseForOwner(input.db) });
}
