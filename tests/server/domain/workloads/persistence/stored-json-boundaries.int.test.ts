// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/workloads/engine/next-runnable.ts
// @subject packages/server/src/domain/workloads/verbs/get.ts
// @subject packages/server/src/domain/workloads/verbs/cancel.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts

import type { Principal } from "@orb/contracts/identity";
import type { WorkloadRef } from "@orb/contracts/workloads";
import { workloadResultSchemaOf } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloads } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { createNextRunnableWorkload } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

const QUEUE_DELAY_MS = 10_000;
const LOG_SCAN_LIMIT = 200;

async function enqueue(harness: ServerTestHarness, caller: Principal | null): Promise<WorkloadRef> {
  return await harness.services.workloads.start({
    ...(caller === null ? { caller, funderUserId: null } : { caller }),
    ownerId: caller?.userId ?? null,
    mode: "singular",
    input: { kind: "assets-backfill", params: { dryRun: true } },
    scheduledAt: harness.clock.now() + QUEUE_DELAY_MS,
  });
}
async function status(db: Db, id: WorkloadId): Promise<Pick<typeof workloads.$inferSelect, "status" | "error"> | undefined> {
  const rows = await db.select({ status: workloads.status, error: workloads.error }).from(workloads).where(eq(workloads.id, id));
  return rows[0];
}

async function actor(harness: ServerTestHarness): Promise<Principal> {
  return await harness.principalFor((await harness.actor()).id);
}

test("owned unreadable progress refuses get and cancel instead of healing to an unreported snapshot", async ({ harness }) => {
  const caller = await actor(harness);
  const row = await enqueue(harness, caller);
  await harness.db
    .update(workloads)
    .set({ progress: sql`${JSON.stringify({ pct: "private progress" })}` })
    .where(eq(workloads.id, row.id));
  await expect(harness.services.workloads.get({ caller, id: row.id })).rejects.toBeInstanceOf(z.ZodError);
  await expect(harness.services.workloads.cancel({ caller, id: row.id })).rejects.toBeInstanceOf(z.ZodError);
  expect(await status(harness.db, row.id)).toEqual({ status: "queued", error: null });
});

test("a foreign malformed JSON row has the same get/cancel/retry refusal as a missing row and no effects", async ({ harness }) => {
  const owner = await actor(harness);
  const foreign = await actor(harness);
  const row = await enqueue(harness, owner);
  await harness.db
    .update(workloads)
    .set({ params: sql`${"{"}` })
    .where(eq(workloads.id, row.id));
  await expect(harness.services.workloads.get({ caller: foreign, id: row.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(harness.services.workloads.cancel({ caller: foreign, id: row.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(harness.services.workloads.retry({ caller: foreign, id: row.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await status(harness.db, row.id)).toEqual({ status: "queued", error: null });
  const rows = await harness.db.select({ id: workloads.id }).from(workloads).where(eq(workloads.ownerId, owner.userId));
  expect(rows.map((stored) => stored.id)).toEqual([row.id]);
});

test("a user cannot privately decode an ownerless system row, while the trusted system caller still gets the actual corruption refusal", async ({
  harness,
}) => {
  const caller = await actor(harness);
  const row = await enqueue(harness, null);
  await harness.db
    .update(workloads)
    .set({ params: sql`${"{"}` })
    .where(eq(workloads.id, row.id));
  await expect(harness.services.workloads.get({ caller, id: row.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(harness.services.workloads.get({ caller: null, id: row.id })).rejects.toBeInstanceOf(SyntaxError);
  expect(await status(harness.db, row.id)).toEqual({ status: "queued", error: null });
});

test("actual admin and system visibility are preserved but never bypass malformed progress validation", async ({ harness }) => {
  const owner = await actor(harness);
  const admin = await harness.principalFor((await harness.actor({ role: "admin" })).id);
  const row = await enqueue(harness, owner);
  await expect(harness.services.workloads.get({ caller: admin, id: row.id })).resolves.toMatchObject({ id: row.id, ownerId: owner.userId });
  await expect(harness.services.workloads.get({ caller: null, id: row.id })).resolves.toMatchObject({ id: row.id, ownerId: owner.userId });
  await harness.db
    .update(workloads)
    .set({ progress: sql`${JSON.stringify({ message: false })}` })
    .where(eq(workloads.id, row.id));
  await expect(harness.services.workloads.get({ caller: admin, id: row.id })).rejects.toBeInstanceOf(z.ZodError);
  await expect(harness.services.workloads.cancel({ caller: null, id: row.id })).rejects.toBeInstanceOf(z.ZodError);
  expect(await status(harness.db, row.id)).toEqual({ status: "queued", error: null });
});

test("a params-poison view never publishes an unvalidated terminal result", async ({ harness }) => {
  const caller = await actor(harness);
  const row = await enqueue(harness, caller);
  await harness.db
    .update(workloads)
    .set({ params: sql`${JSON.stringify({ dryRun: "bad" })}`, result: sql`${JSON.stringify({ scanned: "private result", changed: 0, dryRun: true })}` })
    .where(eq(workloads.id, row.id));
  const view = await harness.services.workloads.get({ caller, id: row.id });
  expect(view).toMatchObject({ id: row.id, poison: true, params: null, result: null });
  expect(JSON.stringify(view)).not.toContain("private result");
  expect(await status(harness.db, row.id)).toEqual({ status: "queued", error: null });
});

const UNREADABLE_RESULT_LINE = "a stored result no longer parses";

function unreadableResultLines(harness: ServerTestHarness, id: WorkloadId): string[] {
  return harness.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(UNREADABLE_RESULT_LINE) && line.includes(id));
}

test("one row whose stored result no longer parses reads as unreadable with the result hidden, and the rest of the list still answers", async ({ harness }) => {
  const stale = await actor(harness);
  const healthy = await actor(harness);
  const unreadable = await enqueue(harness, stale);
  const readable = await enqueue(harness, healthy);
  await harness.db
    .update(workloads)
    .set({ result: sql`${JSON.stringify({ scanned: "stored by an older build", changed: 0, dryRun: true })}` })
    .where(eq(workloads.id, unreadable.id));

  const listed = await harness.services.workloads.list({ caller: null, status: "queued" });

  expect(listed.find((row) => row.id === unreadable.id)).toMatchObject({ poison: true, params: null, result: null });
  expect(listed.find((row) => row.id === readable.id)).toMatchObject({ poison: false, params: { dryRun: true } });
  await expect(harness.services.workloads.get({ caller: stale, id: unreadable.id })).resolves.toMatchObject({
    poison: true,
    params: null,
    result: null,
  });
  expect(JSON.stringify(listed)).not.toContain("stored by an older build");
});

test("an unreadable stored result is logged once however often its row is read, with the row id and never its content", async ({ harness }) => {
  harness.logger.level = "info";
  const stale = await actor(harness);
  const healthy = await actor(harness);
  const unreadable = await enqueue(harness, stale);
  const readable = await enqueue(harness, healthy);
  await harness.db
    .update(workloads)
    .set({ result: sql`${JSON.stringify({ scanned: "private result", changed: 0, dryRun: true })}` })
    .where(eq(workloads.id, unreadable.id));

  await harness.services.workloads.get({ caller: stale, id: unreadable.id });
  await harness.services.workloads.get({ caller: stale, id: unreadable.id });
  await harness.services.workloads.list({ caller: null, status: "queued" });
  await harness.services.workloads.get({ caller: healthy, id: readable.id });

  const lines = unreadableResultLines(harness, unreadable.id);
  expect(lines).toHaveLength(1);
  expect(lines[0]).not.toContain("private result");
  // The control: a row whose result reads logs nothing.
  expect(unreadableResultLines(harness, readable.id)).toEqual([]);
});

test("valid results remain visible on the declared params-poison arm", async ({ harness }) => {
  const caller = await actor(harness);
  const row = await enqueue(harness, caller);
  const result = workloadResultSchemaOf("assets-backfill").parse({ scanned: 3, changed: 1, dryRun: true });
  await harness.db
    .update(workloads)
    .set({ params: sql`${JSON.stringify({ dryRun: "bad" })}`, result })
    .where(eq(workloads.id, row.id));
  expect(await harness.services.workloads.get({ caller, id: row.id })).toMatchObject({ id: row.id, poison: true, params: null, result });
});

for (const field of ["progress", "params", "result"] as const) {
  test(`the actual queue terminalizes malformed ${field} and continues to a healthy owner without leaking or cleaning the bad bytes`, async ({ harness }) => {
    await harness.settleBackground();
    for (const row of await harness.services.workloads.list({ caller: null, status: "queued" })) {
      await harness.services.workloads.cancel({ caller: null, id: row.id });
    }
    const first = await actor(harness);
    const second = await actor(harness);
    const poisoned = await enqueue(harness, first);
    const healthy = await enqueue(harness, second);
    const bytes = field === "params" ? "{" : JSON.stringify(field === "progress" ? { pct: "stored corruption" } : { private: "stored corruption" });
    if (field === "progress") {
      await harness.db
        .update(workloads)
        .set({ progress: sql`${bytes}` })
        .where(eq(workloads.id, poisoned.id));
    } else if (field === "params") {
      await harness.db
        .update(workloads)
        .set({ params: sql`${bytes}` })
        .where(eq(workloads.id, poisoned.id));
    } else {
      await harness.db
        .update(workloads)
        .set({ result: sql`${bytes}` })
        .where(eq(workloads.id, poisoned.id));
    }
    const next = createNextRunnableWorkload({
      db: databaseHandle(harness.db),
      logger: harness.logger,
      contributions: harness.app.workloadContributions,
      emitEvent: harness.app.workloadEvents.emitWorkloadEvent,
    });
    harness.clock.advance(QUEUE_DELAY_MS);
    expect((await next(harness.clock.now(), "sweep"))?.id).toBe(healthy.id);
    expect(await status(harness.db, poisoned.id)).toMatchObject({ status: "failed", error: "unrecognized or malformed workload data: assets-backfill" });
    const healthyState = await status(harness.db, healthy.id);
    expect(healthyState?.error).toBeNull();
    expect(["queued", "running", "succeeded"]).toContain(healthyState?.status);
    const events = harness.app.workloadEvents.getRecentWorkloadEvents(poisoned.id);
    expect(events).toEqual([
      {
        type: "failed",
        workloadId: poisoned.id,
        kind: "assets-backfill",
        at: harness.clock.now(),
        error: { message: "unrecognized or malformed workload data: assets-backfill" },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("stored corruption");
  });
}
