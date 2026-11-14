// A dry run made for the preview is a transient row: its owner reads it by id while the review is open, no list ever
// shows it, and once it has finished it is deleted when the owner's next dry run ends or the box boots. A dry run that
// has not finished is never deleted; it ends through its own verbs.
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/workloads/engine/boot-reclaim.ts
// @subject packages/server/src/domain/import/workload-contributions.ts

import type { PersonaCollisionChoices } from "@orb/contracts/import";
import { ST_SETTINGS_FILE, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { sql } from "drizzle-orm";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, finish, finishRun, harness, post, settings } from "./_st-tree-door.ts";

const NAME_KEY = "bob";
const HELD: Files = { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }) };
const NAMESAKE_SETTINGS = JSON.stringify({
  ["power_user"]: { personas: { "bob.png": "Bob" }, ["persona_descriptions"]: { "bob.png": { description: "Another Bob." } } },
});
const PERSONA_FILES: Files = { [ST_SETTINGS_FILE]: NAMESAKE_SETTINGS };
// The answers a review moves through: each change sends the persona files again as a dry run.
const ANSWER_CHANGES: readonly PersonaCollisionChoices[] = [{ [NAME_KEY]: "keep-both" }, { [NAME_KEY]: "merge" }, { [NAME_KEY]: "keep-both" }];

function folder(root: ServerTestHarness): Files {
  return { [ST_SETTINGS_FILE]: NAMESAKE_SETTINGS, "characters/Aria.png": cardPng(root, "Aria") };
}

async function workloadRows(root: ServerTestHarness): Promise<number> {
  const [row] = await root.db.all<{ n: number }>(sql`SELECT COUNT(*) AS n FROM workloads`);
  return present(row).n;
}

async function dryRunId(root: ServerTestHarness, files: Files, choices: PersonaCollisionChoices = {}): Promise<WorkloadId> {
  const id = await admit(root, files, [TREE_DRY_RUN_VALUE], choices);
  await finish(root, id);
  return id;
}

/** The ids every list door shows the owner: the service list unfiltered and by kind, the system read, and the tRPC list. */
async function listedIds(root: ServerTestHarness): Promise<ReadonlySet<WorkloadId>> {
  const caller = await root.principalFor(root.ownerId);
  const reads = await Promise.all([
    root.services.workloads.list({ caller }),
    root.services.workloads.list({ caller, kind: "import-st" }),
    root.services.workloads.list({ caller: null }),
    (await root.internalCallerFor(root.ownerId)).workloads.list(),
  ]);
  return new Set(reads.flat().map((row) => row.id));
}

async function reboot(root: ServerTestHarness): Promise<void> {
  await reclaimLocksOnBoot({
    logger: root.logger,
    db: bootGrantFor(root.db),
    contributions: root.app.workloadContributions,
    now: root.clock.now,
    holder: "import-preview-leaves-no-row",
    emitWorkloadEvent: root.app.workloadEvents.emitWorkloadEvent,
  });
}

test("a review's dry runs across several answer changes leave only the last one's row, which its id reads and no list shows", async () => {
  await using root = await harness();
  const caller = await root.principalFor(root.ownerId);
  const kept = await admit(root, HELD);
  await finishRun(root, kept);
  const before = await workloadRows(root);

  const first = await dryRunId(root, folder(root));
  const changes: WorkloadId[] = [];
  for (const choices of ANSWER_CHANGES) {
    changes.push(await dryRunId(root, PERSONA_FILES, choices));
  }
  const last = present(changes.at(-1));

  expect(await workloadRows(root)).toBe(before + 1);
  await expect(root.services.workloads.get({ caller, id: last })).resolves.toMatchObject({ status: "succeeded", result: { preview: expect.any(Object) } });
  for (const gone of [first, ...changes.slice(0, -1)]) {
    await expect(root.services.workloads.get({ caller, id: gone })).rejects.toThrow(DomainNotFoundError);
  }
  const listed = await listedIds(root);
  expect([first, ...changes].filter((id) => listed.has(id))).toEqual([]);
  // The control: the real run the owner keeps is in every list.
  expect(listed.has(kept)).toBe(true);
});

test("a dry run not yet finished is never deleted: the next one is refused while it holds the slot, and starts once it is cancelled", async () => {
  await using root = await harness();
  const caller = await root.principalFor(root.ownerId);
  const finished = await dryRunId(root, folder(root));
  const waiting = await admit(root, PERSONA_FILES, [TREE_DRY_RUN_VALUE]);

  const refused = await post(root, PERSONA_FILES, [TREE_DRY_RUN_VALUE]);
  await refused.arrayBuffer();

  expect(refused.status).toBe(409);
  await expect(root.services.workloads.get({ caller, id: waiting })).resolves.toMatchObject({ status: "queued" });
  await expect(root.services.workloads.get({ caller, id: finished })).resolves.toMatchObject({ status: "succeeded" });

  await root.services.workloads.cancel({ caller, id: waiting });
  const next = await dryRunId(root, PERSONA_FILES);

  await expect(root.services.workloads.get({ caller, id: waiting })).rejects.toThrow(DomainNotFoundError);
  await expect(root.services.workloads.get({ caller, id: next })).resolves.toMatchObject({ status: "succeeded" });
});

test("a finished dry run stays readable and cancellable while the next one has no result, and goes when that one ends", async () => {
  await using root = await harness();
  const caller = await root.principalFor(root.ownerId);
  const earlier = await dryRunId(root, folder(root));

  // The reader changed an answer before the client read the earlier run: the client cancels it and starts the next.
  const next = await admit(root, PERSONA_FILES, [TREE_DRY_RUN_VALUE], { [NAME_KEY]: "keep-both" });

  await expect(root.services.workloads.cancel({ caller, id: earlier })).resolves.toEqual({ status: null });
  await expect(root.services.workloads.get({ caller, id: earlier })).resolves.toMatchObject({ status: "succeeded", result: { preview: expect.any(Object) } });

  await finish(root, next);

  await expect(root.services.workloads.get({ caller, id: earlier })).rejects.toThrow(DomainNotFoundError);
  await expect(root.services.workloads.get({ caller, id: next })).resolves.toMatchObject({ status: "succeeded" });
});

test("a boot deletes a finished dry run and keeps a queued one", async () => {
  await using root = await harness();
  const caller = await root.principalFor(root.ownerId);
  const finished = await dryRunId(root, folder(root));
  const queued = await admit(root, PERSONA_FILES, [TREE_DRY_RUN_VALUE]);

  await reboot(root);

  await expect(root.services.workloads.get({ caller, id: finished })).rejects.toThrow(DomainNotFoundError);
  await expect(root.services.workloads.get({ caller, id: queued })).resolves.toMatchObject({ status: "queued" });
});
