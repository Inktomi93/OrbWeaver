// Admission, contribution params, active-slot adoption and schedule cadence remain production decisions.
import { workloadSchedules, workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createNextRunnableWorkload } from "@orb/server/domain/workloads";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot, ServerTestHarness } from "../server.ts";

type WorkloadService = ServicesResult["services"]["workloads"];
type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;

export type WorkloadDbRow = typeof workloads.$inferSelect;

/** The engine's own queue scan bound to the root, so a suite reads what a lane's worker would claim next. */
export function createQueueScanner(root: Pick<ServerTestHarness, "db" | "app">): ReturnType<typeof createNextRunnableWorkload> {
  return createNextRunnableWorkload({
    db: databaseHandle(root.db),
    contributions: root.app.workloadContributions,
    emitEvent: root.app.workloadEvents.emitWorkloadEvent,
  });
}

/** Captures the admitted/adopted row's actual state; enqueue is not evidence of successful execution. */
export async function seedWorkload(root: ServerProducerRoot, params: Parameters<WorkloadService["start"]>[0]): Promise<WorkloadDbRow> {
  const db = root.db;
  const start = root.services.workloads.start;
  const ref = await start(params);
  const row = await db.select().from(workloads).where(eq(workloads.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload admission left no canonical row");
  }
  return row;
}

export async function seedWorkloadSchedule(root: ServerProducerRoot, params: Parameters<WorkloadService["createSchedule"]>[0]): Promise<WorkloadScheduleRow> {
  const db = root.db;
  const createSchedule = root.services.workloads.createSchedule;
  const ref = await createSchedule(params);
  const row = await db.select().from(workloadSchedules).where(eq(workloadSchedules.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload scheduling left no canonical schedule row");
  }
  return row;
}
