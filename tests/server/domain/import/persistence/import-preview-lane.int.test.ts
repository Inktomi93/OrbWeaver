// A dry run is a person watching a progress bar, so it runs on the interactive lane while a real import stays a sweep.
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/workloads/verbs/start.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts

import { TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { expect, test } from "@orb/testkit/node";
import { createQueueScanner, freshHeldDb } from "@orb/testkit/node/composed";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, finish, harness } from "./_st-tree-door.ts";

/** The first statement a stats rebuild issues for its owner: the sweep parks here, running, until released. */
const STATS_REBUILD_FIRST_READ = /FROM stats_canon_versions/i;

function profile(root: Parameters<typeof cardPng>[0]): Files {
  return { "characters/Aria.png": cardPng(root, "Aria") };
}

test("a dry run is claimed from the interactive lane and completes while a sweep is still running; its retry is stamped the same way", async () => {
  using held = await freshHeldDb();
  await using root = await harness(held.db);
  const principal = await root.principalFor(root.ownerId);
  const nextRunnable = createQueueScanner(root);
  const runAdmitted = root.runAdmittedWorkload;
  if (runAdmitted === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }

  const rebuilding = held.hold(STATS_REBUILD_FIRST_READ);
  const sweep = await root.services.workloads.start({
    caller: principal,
    mode: "bulk",
    ownerId: root.ownerId,
    input: { kind: "reconcile-stats", params: {} },
  });
  const sweepRun = runAdmitted(sweep.id, AbortSignal.timeout(30_000));
  // Released in the finally, so a failed assertion never leaves the parked sweep holding the root open.
  try {
    await rebuilding.reached;
    expect(await root.services.workloads.get({ caller: principal, id: sweep.id })).toMatchObject({ lane: "sweep", status: "running" });

    const preview = await admit(root, profile(root), [TREE_DRY_RUN_VALUE]);
    expect((await nextRunnable(root.clock.now(), "interactive"))?.id).toBe(preview);
    await finish(root, preview);
    expect((await root.services.workloads.get({ caller: principal, id: sweep.id })).status).toBe("running");

    const again = await root.services.workloads.retry({ caller: principal, id: preview });
    expect((await nextRunnable(root.clock.now(), "interactive"))?.id).toBe(again.id);
  } finally {
    rebuilding.release();
  }
  await sweepRun;
  expect((await root.services.workloads.get({ caller: principal, id: sweep.id })).status).toBe("succeeded");
});

test("a real import stays on the sweep lane", async () => {
  await using root = await harness();
  const nextRunnable = createQueueScanner(root);
  const real = await admit(root, profile(root));
  expect({
    interactive: (await nextRunnable(root.clock.now(), "interactive"))?.id,
    sweep: (await nextRunnable(root.clock.now(), "sweep"))?.id,
  }).toEqual({ interactive: undefined, sweep: real });
});
