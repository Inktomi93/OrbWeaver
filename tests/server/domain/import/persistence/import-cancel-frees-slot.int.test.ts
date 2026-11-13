// A cancel reaches the running import at once, so the account's one import slot frees when the run unwinds.
// @subject packages/server/src/domain/workloads/verbs/cancel.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/import/workload-contributions.ts

import { expect, test } from "@orb/testkit/node";
import { freshHeldDb, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { admit, cardPng, harness } from "./_st-tree-door.ts";

/** The dedup read a card import issues for its character: the run parks here, inside the import. */
const CARD_DEDUP_READ = /import_hash/i;

test("cancelling a running import stops it before the next card and the next pick is admitted", async () => {
  using held = await freshHeldDb();
  await using root = await harness({ db: held.db });
  const principal = await root.principalFor(root.ownerId);
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  const first = await admit(root, { "characters/Aria.png": cardPng(root, "Aria"), "characters/Bram.png": cardPng(root, "Bram") });
  const parked = held.hold(CARD_DEDUP_READ);
  const running = run(first, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  // Released in the finally, so a failed assertion never leaves the parked run holding the root open.
  try {
    await parked.reached;
    expect(await root.services.workloads.cancel({ caller: principal, id: first })).toEqual({ status: "cancelling" });
  } finally {
    parked.release();
  }
  await running;

  expect((await root.services.workloads.get({ caller: principal, id: first })).status).toBe("cancelled");
  // The lease timers never ran here, so only the cancel itself can have stopped the run short of its last card.
  const caller = await root.internalCallerFor(root.ownerId);
  expect((await caller.character.list({})).items.map((item) => item.name)).not.toContain("Bram");
  await admit(root, { "characters/Cole.png": cardPng(root, "Cole") });
});
