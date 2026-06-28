// entry/boot/reclaim-locks — the single-replica boot reclaim. Real libSQL :memory: (the .int lane). Covers:
// an in-flight (running) workload is reaped to worker_died at boot regardless of how recent its lease is
// (threshold 0); a queued row (not in-flight) is left alone; an empty queue reaps nothing. The workloads
// reaper internals are tested in domain/workloads; this pins the boot wiring + the threshold-0 semantics.

import { WORKLOAD_KINDS } from "@orb/contracts/workloads";
import { workloads } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

const KIND = WORKLOAD_KINDS[0];
const RUNNING_ID = castId<WorkloadId>("workload_running1");
const QUEUED_ID = castId<WorkloadId>("workload_queued1");

test("reaps a running workload to worker_died at boot (threshold 0)", async ({ clock }) => {
  const db = await freshDb();
  // A lease touched just 1s ago — the steady-state 15s grace would spare it, but a boot reclaim wipes it.
  await db.insert(workloads).values({
    id: RUNNING_ID,
    kind: KIND,
    status: "running",
    ownerId: null,
    updatedAt: clock.now() - 1000,
  });

  const reaped = await reclaimLocksOnBoot({ db, now: clock.now });

  expect(reaped).toBe(1);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("worker_died");
});

test("leaves a queued (not in-flight) workload untouched", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(workloads).values({
    id: QUEUED_ID,
    kind: KIND,
    status: "queued",
    ownerId: null,
    updatedAt: clock.now() - 1000,
  });

  const reaped = await reclaimLocksOnBoot({ db, now: clock.now });

  expect(reaped).toBe(0);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, QUEUED_ID));
  expect(row?.status).toBe("queued");
});

test("an empty queue reaps nothing", async ({ clock }) => {
  const db = await freshDb();
  const reaped = await reclaimLocksOnBoot({ db, now: clock.now });
  expect(reaped).toBe(0);
});
