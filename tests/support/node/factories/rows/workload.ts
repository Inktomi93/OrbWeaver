// Workload rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { workloadSchedules, workloads } from "@orb/db";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { WorkloadDbRow, WorkloadScheduleRow, WorkloadService } from "../workload.ts";

/** Captures the admitted/adopted row's actual state; enqueue is not evidence of successful execution. */
export async function seedWorkloadRows(root: ServerProducerRoot, params: Parameters<WorkloadService["start"]>[0]): Promise<WorkloadDbRow> {
  const db = root.db;
  const start = root.services.workloads.start;
  const ref = await start(params);
  const row = await db.select().from(workloads).where(eq(workloads.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload admission left no canonical row");
  }
  return row;
}

export async function seedWorkloadScheduleRows(
  root: ServerProducerRoot,
  params: Parameters<WorkloadService["createSchedule"]>[0],
): Promise<WorkloadScheduleRow> {
  const db = root.db;
  const createSchedule = root.services.workloads.createSchedule;
  const ref = await createSchedule(params);
  const row = await db.select().from(workloadSchedules).where(eq(workloadSchedules.id, ref.id)).get();
  if (row === undefined) {
    throw new Error("production workload scheduling left no canonical schedule row");
  }
  return row;
}
