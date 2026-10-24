// Workload seeds run the production verbs and return their outcomes; rows-tier twins in `rows/workload.ts` read the rows.

import type { workloadSchedules, workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createNextRunnableWorkload } from "@orb/server/domain/workloads";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

export type WorkloadService = ServicesResult["services"]["workloads"];
export type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;

export type WorkloadDbRow = typeof workloads.$inferSelect;

/** The engine's own queue scan bound to the root, so a suite reads what the worker would claim next. */
export function createQueueScanner(root: Pick<ServerTestHarness, "db" | "app">): ReturnType<typeof createNextRunnableWorkload> {
  return createNextRunnableWorkload({
    db: databaseHandle(root.db),
    contributions: root.app.workloadContributions,
    emitEvent: root.app.workloadEvents.emitWorkloadEvent,
  });
}

/** Run the schedule creation; the reference it returns names the schedule. */
export async function seedWorkloadSchedule(
  root: ServerProducerRoot,
  params: Parameters<WorkloadService["createSchedule"]>[0],
): Promise<Awaited<ReturnType<WorkloadService["createSchedule"]>>> {
  return await root.services.workloads.createSchedule(params);
}
