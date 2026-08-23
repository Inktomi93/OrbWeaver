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
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow } from "../../domain/workloads/_support.ts";

// The row read path narrows params against the contribution registry (findStaleInFlight builds views).
const CONTRIBUTIONS = fakeContributions();
const RUNNING_ID = castId<WorkloadId>("workload_running1");
const QUEUED_ID = castId<WorkloadId>("workload_queued1");
const HOLDER = "test-replica";
// The two reap sentences the row's `error` must keep apart (#560).
const RESTART_SENTENCE = /restart/i;
const STALE_HEARTBEAT_SENTENCE = /heartbeat went stale/i;

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

  const reaped = await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  expect(reaped).toBe(1);
  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.status).toBe("worker_died");
});

// #560 — THE ATTRIBUTION PINS. Both reap paths run the same sweep and write the same `worker_died` status,
// and `markTerminal` overwrites `updated_at` (the lease column) with the reap instant, so the row's `error`
// string is the ONLY surviving evidence of WHY a long pass died. Before this, the boot path stamped the
// steady-state sentence ("worker heartbeat went stale"), which is false here — the lease was seconds old and
// the process, not the lease, is what ended. A forensics lane had to reconstruct the cause from lane ordering
// and inter-death gaps because these two sentences were identical on the row.
test("attributes a boot reclaim to the RESTART, not to a stale heartbeat", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, { id: RUNNING_ID, status: "running", updatedAt: clock.now() - 1000 });

  await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  expect(row?.error).toMatch(RESTART_SENTENCE);
  expect(row?.error).not.toMatch(STALE_HEARTBEAT_SENTENCE);
});

test("a reap records the OBSERVED lease age, which the terminal stamp then overwrites", async ({ clock }) => {
  const db = await freshDb();
  await seedWorkloadRow(db, { id: RUNNING_ID, status: "running", updatedAt: clock.now() - 1000 });

  await reclaimLocksOnBoot({ db, contributions: CONTRIBUTIONS, now: clock.now, holder: HOLDER });

  const [row] = await db.select().from(workloads).where(eq(workloads.id, RUNNING_ID));
  // The number is the whole point: `updated_at` below is now the REAP instant, so without this the age is
  // unrecoverable. A boot reclaim's age is small BY CONSTRUCTION (threshold 0) — that is the tell that
  // separates it from a genuine grace-window expiry.
  expect(row?.error).toContain("1000ms");
  expect(row?.updatedAt).toBe(clock.now());
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
