// A dry run is a person watching a progress bar, so it runs on the interactive lane while a real import stays a sweep.
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/workloads/verbs/start.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts
// @subject packages/server/src/transport/jobs/workloads-worker.ts

import { setTimeout as physicalDelay } from "node:timers/promises";
import { TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createQueueScanner, freshHeldDb } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, finish, harness } from "./_st-tree-door.ts";

/** The first statement a stats rebuild issues for its owner: the sweep parks here, running, until released. */
const STATS_REBUILD_FIRST_READ = /FROM stats_canon_versions/i;
/** One idle poll period of the worker's loops. */
const WORKER_POLL_MS = 2000;
/** Real time per drive step, so the database work between two timer advances can finish. */
const DRIVE_STEP_MS = 5;
const DRIVE_STEPS = 400;

function profile(root: Parameters<typeof cardPng>[0]): Files {
  return { "characters/Aria.png": cardPng(root, "Aria") };
}

/** Advance the worker's poll timers until `done` holds; false when it never does within the step budget. */
async function driveWorker(root: ServerTestHarness, done: () => Promise<boolean>): Promise<boolean> {
  for (let step = 0; step < DRIVE_STEPS; step += 1) {
    if (await done()) {
      return true;
    }
    root.timers.advance(WORKER_POLL_MS);
    await physicalDelay(DRIVE_STEP_MS);
  }
  return await done();
}

test("a dry run is stamped interactive at start and at retry, a real import sweep", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const nextRunnable = createQueueScanner(root);

  const preview = await admit(root, profile(root), [TREE_DRY_RUN_VALUE]);
  expect((await nextRunnable(root.clock.now(), "interactive"))?.id).toBe(preview);
  await finish(root, preview);
  const again = await root.services.workloads.retry({ caller: principal, id: preview });
  expect((await nextRunnable(root.clock.now(), "interactive"))?.id).toBe(again.id);
  await root.services.workloads.cancel({ caller: principal, id: again.id });

  const real = await admit(root, profile(root));
  expect({
    interactive: (await nextRunnable(root.clock.now(), "interactive"))?.id,
    sweep: (await nextRunnable(root.clock.now(), "sweep"))?.id,
  }).toEqual({ interactive: undefined, sweep: real });
});

test("the running worker claims a dry run on the interactive loop while the sweep loop is parked in a sweep", async () => {
  using held = await freshHeldDb();
  await using root = await harness({ db: held.db, startJobs: true });
  const principal = await root.principalFor(root.ownerId);
  const statusOf = async (id: WorkloadId): Promise<string> => (await root.services.workloads.get({ caller: principal, id })).status;

  const rebuilding = held.hold(STATS_REBUILD_FIRST_READ);
  const sweep = await root.services.workloads.start({
    caller: principal,
    mode: "bulk",
    ownerId: root.ownerId,
    input: { kind: "reconcile-stats", params: {} },
  });
  // Released in the finally, so a failed assertion never leaves the parked sweep holding the root open.
  try {
    // The sweep loop claims the row and parks inside it: the one-wide sweep lane is now occupied.
    expect(await driveWorker(root, async () => (await statusOf(sweep.id)) === "running")).toBe(true);
    await rebuilding.reached;

    const preview = await admit(root, profile(root), [TREE_DRY_RUN_VALUE]);
    const previewSettled = await driveWorker(root, async () => (await statusOf(preview)) === "succeeded");
    expect({ preview: await statusOf(preview), sweep: await statusOf(sweep.id), previewSettled }).toEqual({
      preview: "succeeded",
      sweep: "running",
      previewSettled: true,
    });
  } finally {
    rebuilding.release();
  }
  expect(await driveWorker(root, async () => (await statusOf(sweep.id)) === "succeeded")).toBe(true);
});
