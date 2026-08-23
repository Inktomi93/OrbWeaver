// entry/boot/reclaim-locks — the single-replica boot reclaim. Real libSQL :memory: (the .int lane). Covers:
// an in-flight (running) workload of a RESUMABLE kind is RE-QUEUED at boot (#529 — a respawn must not be a
// terminal for a job that declares `idempotent-restart`), a non-resumable kind still goes to worker_died, the
// respawn-loop guard goes terminal after the bound, a queued row (not in-flight) is left alone, an empty
// queue reclaims nothing, and this replica's orphaned chat turn-locks are reclaimed by holder (while another
// holder's lock is spared). The workloads reclaim + chat-lock internals are tested in their domains; this
// pins the boot wiring + the threshold-0 semantics.

import { chatLocks, chats, workloads } from "@orb/db";
import type { ChatId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow } from "../../domain/workloads/_support.ts";

// The row read path narrows params against the contribution registry (the reclaim sweep resolves each row's
// kind through it to read the declared resume policy).
const CONTRIBUTIONS = fakeContributions();
// Every shipped contribution declares `idempotent-restart`; a `none` kind is synthesized per-test.
const NON_RESUMABLE = { ...CONTRIBUTIONS, "reconcile-stats": { ...CONTRIBUTIONS["reconcile-stats"], resume: "none" } } as const;
const RUNNING_ID = castId<WorkloadId>("workload_running1");
const QUEUED_ID = castId<WorkloadId>("workload_queued1");
const HOLDER = "test-replica";

test("RE-QUEUES an in-flight row of an idempotent-restart kind at boot (it is not a terminal)", async ({ clock }) => {
  const db = await freshDb();
  // A lease touched just 1s ago — the steady-state 15s grace would spare it, but a boot reclaim wipes it.
  // seedWorkloadRow gives a toView-valid row (kind reconcile-stats + mode/source/params).
  await seedWorkloadRow(db, {
    id: RUNNING_ID,
    status: "running",
    updatedAt: clock.now() - 1000,
  });

  const reclaimed = await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  expect(reclaimed).toBe(1);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("queued");
});

test("reaps an in-flight row of a NON-resumable kind to worker_died (the pre-#529 behavior, preserved)", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, {
    id: RUNNING_ID,
    status: "running",
    updatedAt: clock.now() - 1000,
  });

  const reclaimed = await reclaimLocksOnBoot({ db, contributions: NON_RESUMABLE, now: clock.now, holder: HOLDER });

  expect(reclaimed).toBe(1);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("worker_died");
});

test("the respawn-loop guard: a row respawned to the bound without progress goes terminal with a reason", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, {
    id: RUNNING_ID,
    status: "running",
    updatedAt: clock.now() - 1000,
  });

  // One crash cycle: boot reclaims the orphan, then a worker claims the re-queued row back to `running`
  // (the state the NEXT crash orphans). Unrolled rather than looped — the bound is 3, and the assertion
  // between passes is the point (each of the first three must come back QUEUED, not terminal).
  const crashCycle = async (): Promise<void> => {
    await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });
    const [requeued] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
    expect(requeued?.status).toBe("queued");
    await db.update(workloads).set({ status: "running" }).where(eq(workloads.id, RUNNING_ID));
  };
  await crashCycle();
  await crashCycle();
  await crashCycle();

  await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("worker_died");
  expect(row?.error).toContain("respawn");
});

test("leaves a queued (not in-flight) workload untouched", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, {
    id: QUEUED_ID,
    status: "queued",
    updatedAt: clock.now() - 1000,
  });

  const reaped = await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  expect(reaped).toBe(0);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, QUEUED_ID));
  expect(row?.status).toBe("queued");
});

test("an empty queue reaps nothing", async ({ clock }) => {
  const db = await freshDb();
  const reaped = await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });
  expect(reaped).toBe(0);
});

test("reclaims THIS replica's orphaned chat turn-locks (by holder) but spares another holder's", async ({ clock }) => {
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
  const reclaimed = await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  expect(reclaimed).toBe(1);
  const remaining = await db.select().from(chatLocks);
  expect(remaining.map((r) => r.chatId)).toEqual([theirs]);
});
