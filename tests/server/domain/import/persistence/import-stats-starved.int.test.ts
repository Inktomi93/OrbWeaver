// A SillyTavern import whose rows have landed never fails because live chat outran its stats rebuild: each time the
// rebuild is about to replace the owner's rollups, a narrator line lands in the imported room, until every attempt
// is spent. The import still succeeds, and the rebuild it could not finish waits as a queued reconcile-stats run that
// brings the rollups level with the canon once it runs.
// @subject packages/server/src/domain/import/verbs/settle-import-stats.ts
// @subject packages/server/src/domain/import/workload-contributions.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { STATS_REBUILD_ATTEMPTS } from "@orb/contracts/stats";
import type { WorkloadId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { HeldDb, ServerTestHarness } from "@orb/testkit/node/composed";
import { freshHeldDb, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { admit, CHAT, cardPng, harness, settings } from "./_st-tree-door.ts";

// The rebuild's replace batch opens with this guard: it rewrites the owner's canon version only while the snapshot
// it folded still holds.
const CANON_GUARD = /^insert into "stats_canon_versions".*\(SELECT COALESCE\(\(SELECT version FROM stats_canon_versions/u;
const CARD = "Aria";

async function importedRoom(root: ServerTestHarness): Promise<Parameters<ServerTestHarness["app"]["chatRpgOps"]["postNarratorMessage"]>[0]> {
  const [chat, ...others] = (await root.services.chat.listChats({ principal: await root.principalFor(root.ownerId) })).items;
  if (chat === undefined || others.length > 0) {
    throw new Error("expected the one imported room");
  }
  return chat.id;
}

/** Run the admitted import, landing a narrator line under every rebuild replace it sends; returns how many it raced. */
async function runOutrun(held: Pick<HeldDb, "hold">, root: ServerTestHarness, id: WorkloadId): Promise<{ readonly raced: number; readonly error: unknown }> {
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  let gate = held.hold(CANON_GUARD);
  const outcome = run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS)).then(
    () => null,
    (error: unknown) => error,
  );
  let raced = 0;
  try {
    for (;;) {
      const step = await Promise.race([gate.reached.then(() => "held" as const), outcome.then(() => "settled" as const)]);
      if (step === "settled") {
        return { raced, error: await outcome };
      }
      gate.disarm();
      raced += 1;
      await root.app.chatRpgOps.postNarratorMessage(await importedRoom(root), `The harbor stirs ${String(raced)}.`);
      const parked = gate;
      gate = held.hold(CANON_GUARD);
      parked.release();
    }
  } finally {
    gate.release();
  }
}

test("an import whose stats rebuild live chat outruns on every attempt succeeds, and a queued rebuild settles the rollups", async () => {
  using held = await freshHeldDb();
  await using root = await harness({ db: held.db });
  const caller = await root.principalFor(root.ownerId);
  const id = await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`characters/${CARD}.png`]: cardPng(root, CARD), [`chats/${CARD}/solo.jsonl`]: CHAT });

  const { raced, error } = await runOutrun(held, root, id);

  expect(error).toBeNull();
  expect(raced).toBe(STATS_REBUILD_ATTEMPTS);
  expect(await root.services.workloads.get({ caller, id })).toMatchObject({ kind: "import-st", status: "succeeded" });
  const [queued, ...more] = await root.services.workloads.list({ caller, kind: "reconcile-stats", status: "queued" });
  expect(more).toEqual([]);
  if (queued === undefined || root.runAdmittedWorkload === undefined) {
    throw new Error("the deferred rebuild was not queued");
  }
  // Before the queued rebuild runs, the rollups miss the imported room; after it, they count it and every raced line.
  expect(await root.services.stats.overview(root.ownerId)).not.toMatchObject({ chats: 1 });
  await root.runAdmittedWorkload(queued.id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  expect(await root.services.stats.overview(root.ownerId)).toMatchObject({ chats: 1, assistantTurns: 1 + raced });
});

test("an import whose stats rebuild no writer races rebuilds in the run and queues no rebuild", async () => {
  using held = await freshHeldDb();
  await using root = await harness({ db: held.db });
  const caller = await root.principalFor(root.ownerId);
  const id = await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`characters/${CARD}.png`]: cardPng(root, CARD), [`chats/${CARD}/solo.jsonl`]: CHAT });
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }

  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));

  expect(await root.services.workloads.get({ caller, id })).toMatchObject({ kind: "import-st", status: "succeeded" });
  expect(await root.services.workloads.list({ caller, kind: "reconcile-stats" })).toEqual([]);
  expect(await root.services.stats.overview(root.ownerId)).toMatchObject({ chats: 1, assistantTurns: 1 });
});
