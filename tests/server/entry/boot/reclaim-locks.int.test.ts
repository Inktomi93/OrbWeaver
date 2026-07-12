// entry/boot/reclaim-locks — the single-replica boot reclaim. Real libSQL :memory: (the .int lane). Covers:
// an in-flight (running) workload is reaped to worker_died at boot regardless of how recent its lease is
// (threshold 0); a queued row (not in-flight) is left alone; an empty queue reaps nothing; and this replica's
// orphaned chat turn-locks are reclaimed by holder (while another holder's lock is spared). The workloads
// reaper + chat-lock internals are tested in their domains; this pins the boot wiring + the threshold-0 semantics.

import { chatLocks, chats, workloads } from "@orb/db";
import type { ChatId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { seedWorkloadRow } from "../../domain/workloads/_support.ts";

const RUNNING_ID = castId<WorkloadId>("workload_running1");
const QUEUED_ID = castId<WorkloadId>("workload_queued1");
const HOLDER = "test-replica";

test("reaps a running workload to worker_died at boot (threshold 0)", async ({ clock }) => {
  const db = await freshDb();
  // A lease touched just 1s ago — the steady-state 15s grace would spare it, but a boot reclaim wipes it.
  // seedWorkloadRow gives a toView-valid row (kind reconcile-stats + mode/source/params) — the reaper is
  // kind-agnostic (it sweeps by status+lease), but findStaleInFlight filters rows that can't form a view.
  await seedWorkloadRow(db, {
    id: RUNNING_ID,
    status: "running",
    updatedAt: clock.now() - 1000,
  });

  const reaped = await reclaimLocksOnBoot({ db, now: clock.now, holder: HOLDER });

  expect(reaped).toBe(1);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("worker_died");
});

test("leaves a queued (not in-flight) workload untouched", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, {
    id: QUEUED_ID,
    status: "queued",
    updatedAt: clock.now() - 1000,
  });

  const reaped = await reclaimLocksOnBoot({ db, now: clock.now, holder: HOLDER });

  expect(reaped).toBe(0);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, QUEUED_ID));
  expect(row?.status).toBe("queued");
});

test("an empty queue reaps nothing", async ({ clock }) => {
  const db = await freshDb();
  const reaped = await reclaimLocksOnBoot({ db, now: clock.now, holder: HOLDER });
  expect(reaped).toBe(0);
});

test("reclaims THIS replica's orphaned chat turn-locks (by holder) but spares another holder's", async ({
  clock,
}) => {
  const db = await freshDb();
  const mine = castId<ChatId>("chat_mine");
  const theirs = castId<ChatId>("chat_theirs");
  await db.insert(chats).values([{ id: mine }, { id: theirs }]);
  await db.insert(chatLocks).values([
    { chatId: mine, holder: HOLDER, acquiredAt: clock.now(), expiresAt: clock.now() + 120_000 },
    {
      chatId: theirs,
      holder: "other-replica",
      acquiredAt: clock.now(),
      expiresAt: clock.now() + 120_000,
    },
  ]);

  // Total = 0 workloads + 1 chat-lock (this holder's only). The other replica's live lock is untouched.
  const reclaimed = await reclaimLocksOnBoot({ db, now: clock.now, holder: HOLDER });

  expect(reclaimed).toBe(1);
  const remaining = await db.select().from(chatLocks);
  expect(remaining.map((r) => r.chatId)).toEqual([theirs]);
});
