// A staged upload is freed when its row ends without running, with no boot sweep: the row's params stopped parsing,
// or its owner is gone. No verb writes unreadable params or deletes a user, so both states are planted directly.
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/workloads/verbs/cancel.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts

import { readdir } from "node:fs/promises";
import { workloads } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createQueueScanner } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { admit, cardPng, harness, stagedEntries } from "./_st-tree-door.ts";

/** Admit one folder and return its row with the upload it staged; the upload is on disk and nothing has read it. */
async function admitted(root: ServerTestHarness): Promise<{ readonly id: WorkloadId; readonly stagedDir: string }> {
  const id = await admit(root, { "characters/Aria.png": cardPng(root, "Aria") });
  const [stagedDir] = await readdir(root.stagedImportsOf(root.ownerId));
  if (stagedDir === undefined) {
    throw new Error("the tree door staged nothing");
  }
  return { id, stagedDir };
}

/** Rewrite the row's params to text its kind's schema refuses, still naming the upload it staged. */
async function unreadable(root: ServerTestHarness, id: WorkloadId, stagedDir: string): Promise<void> {
  await root.db
    .update(workloads)
    .set({ params: sql`${JSON.stringify({ stagedDir, dryRun: "not a boolean" })}` })
    .where(eq(workloads.id, id));
}

async function statusOf(root: ServerTestHarness, id: WorkloadId): Promise<string | undefined> {
  return (await root.db.select({ status: workloads.status }).from(workloads).where(eq(workloads.id, id)).get())?.status;
}

test("cancelling a queued import whose params no longer parse frees its staged upload", async () => {
  await using root = await harness();
  const { id, stagedDir } = await admitted(root);
  await unreadable(root, id, stagedDir);
  expect(await stagedEntries(root)).not.toEqual([]);

  expect(await root.services.workloads.cancel({ caller: await root.principalFor(root.ownerId), id })).toEqual({ status: "cancelled" });

  expect(await stagedEntries(root)).toEqual([]);
});

test("the queue fails an import whose params no longer parse and frees its staged upload", async () => {
  await using root = await harness();
  const { id, stagedDir } = await admitted(root);
  await unreadable(root, id, stagedDir);

  expect(await createQueueScanner(root)(root.clock.now(), "sweep")).toBeNull();

  expect(await statusOf(root, id)).toBe("failed");
  expect(await stagedEntries(root)).toEqual([]);
});

test("the queue fails an import whose owner is gone and frees the upload from that account's root", async () => {
  await using root = await harness();
  const { id } = await admitted(root);
  // What deleting the account leaves on its rows: the owner cleared, and the row still not system work.
  await root.db.update(workloads).set({ ownerId: null }).where(eq(workloads.id, id));

  expect(await createQueueScanner(root)(root.clock.now(), "sweep")).toBeNull();

  expect(await statusOf(root, id)).toBe("failed");
  expect(await stagedEntries(root)).toEqual([]);
});
