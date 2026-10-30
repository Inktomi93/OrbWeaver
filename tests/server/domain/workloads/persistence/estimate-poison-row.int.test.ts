// Storage is the subject: a workload row whose stored params no longer parse has nothing to count, so its retry estimate
// answers null and never reaches the kind's estimator. The row is corrupted in the table; the estimate is read through the verb.
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts

import { workloads } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const QUEUE_DELAY_MS = 10_000;

async function queuedThemes(harness: ServerTestHarness): ReturnType<ServerTestHarness["services"]["workloads"]["start"]> {
  const caller = await harness.principalFor((await harness.actor()).id);
  return await harness.services.workloads.start({
    caller,
    ownerId: caller.userId,
    mode: "singular",
    input: { kind: "compute-themes", params: { k: 1 } },
    scheduledAt: harness.clock.now() + QUEUE_DELAY_MS,
  });
}

test("a retry estimate of a params-poison row answers null while a healthy row of the same kind answers a count", async ({ harness }) => {
  const healthy = await queuedThemes(harness);
  const poisoned = await queuedThemes(harness);
  // An unreadable params blob is what a build that no longer ships the stored shape leaves behind.
  await harness.db
    .update(workloads)
    .set({ params: sql`${JSON.stringify({ k: "bad" })}` })
    .where(eq(workloads.id, poisoned.id));

  const rows = await harness.services.workloads.list({ caller: null, kind: "compute-themes" });
  expect(rows.filter((row) => row.id === poisoned.id).map((row) => row.poison)).toEqual([true]);
  expect(rows.filter((row) => row.id === healthy.id).map((row) => row.poison)).toEqual([false]);
  const owner = async (id: typeof healthy.id): Promise<Awaited<ReturnType<ServerTestHarness["principalFor"]>>> => {
    const row = await harness.services.workloads.get({ caller: null, id });
    if (row.ownerId === null) {
      throw new Error("the queued theme run has no owner");
    }
    return await harness.principalFor(row.ownerId);
  };
  expect(await harness.services.workloads.estimateRetryModelCalls({ caller: await owner(healthy.id), id: healthy.id })).toEqual({ calls: expect.any(Number) });
  expect(await harness.services.workloads.estimateRetryModelCalls({ caller: await owner(poisoned.id), id: poisoned.id })).toEqual({ calls: null });
});
