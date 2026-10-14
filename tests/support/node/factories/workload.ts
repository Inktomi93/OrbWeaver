// Admission, contribution params, active-slot adoption and schedule cadence remain production decisions.
import type { Db } from "@orb/db";
import { workloadSchedules, workloads } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";

type WorkloadService = ServicesResult["services"]["workloads"];
type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;

export type WorkloadDbRow = typeof workloads.$inferSelect;

/** Captures the admitted/adopted row's actual state; enqueue is not evidence of successful execution. */
export async function seedWorkload(db: Db, start: WorkloadService["start"], params: Parameters<WorkloadService["start"]>[0]): Promise<WorkloadDbRow> {
  const ref = await start(params);
  const row = await db.select().from(workloads).where(eq(workloads.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload admission left no canonical row");
  }
  return row;
}

export async function seedWorkloadSchedule(
  db: Db,
  createSchedule: WorkloadService["createSchedule"],
  params: Parameters<WorkloadService["createSchedule"]>[0],
): Promise<WorkloadScheduleRow> {
  const ref = await createSchedule(params);
  const row = await db.select().from(workloadSchedules).where(eq(workloadSchedules.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload scheduling left no canonical schedule row");
  }
  return row;
}
