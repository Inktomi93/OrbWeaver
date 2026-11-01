// How long a staged upload lives: a row owns it from the 202, every way out of the queue frees it, and a boot frees
// what a dead process left while leaving a queued run's tree and everything it did not stage alone.
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/workloads/verbs/cancel.ts
// @subject packages/server/src/domain/workloads/engine/boot-reclaim.ts

import { mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { importStartedSchema, ST_SETTINGS_FILE, TREE_DRY_RUN_VALUE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { workloads } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { STAGED_BUNDLE_PREFIX, STAGED_TREE_PREFIX } from "@orb/server/domain/import";
import { reclaimLocksOnBoot } from "@orb/server/entry/boot";
import { ZIP_STAGING_PREFIX } from "@orb/server/infra/storage/zip";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { eq, sql } from "drizzle-orm";
import { vi } from "vitest";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import { admit, cardPng, finish, harness, settings, stagedEntries, stagedTree } from "./_st-tree-door.ts";

function folder(root: ServerTestHarness): Readonly<Record<string, string | Uint8Array>> {
  return { [ST_SETTINGS_FILE]: settings({ "bob.png": "Bob" }), "characters/Aria.png": cardPng(root, "Aria") };
}

async function reboot(root: ServerTestHarness): Promise<void> {
  await reclaimLocksOnBoot({
    logger: root.logger,
    db: bootGrantFor(root.db),
    contributions: root.app.workloadContributions,
    now: root.clock.now,
    holder: "import-staging-lifetime",
    emitWorkloadEvent: root.app.workloadEvents.emitWorkloadEvent,
  });
}

/** What a run that died with its process left: a staged upload no live row names. */
async function plantOrphan(root: ServerTestHarness, name: string, ownerId = root.ownerId): Promise<string> {
  const path = join(root.stagedImportsOf(ownerId), name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "left-behind.txt"), "orphan");
  return path;
}

test("cancelling a queued folder import frees its staged tree", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root), [TREE_DRY_RUN_VALUE]);
  expect(await stagedEntries(root)).not.toEqual([]);

  const result = await root.services.workloads.cancel({ caller: await root.principalFor(root.ownerId), id });

  expect(result).toEqual({ status: "cancelled" });
  expect(await stagedEntries(root)).toEqual([]);
});

test("cancelling a queued bundle import frees its staged archive", async () => {
  await using root = await harness();
  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: CSRF_HEADERS, body: new Uint8Array([1, 2, 3]) });
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  expect(await stagedEntries(root)).toHaveLength(1);

  await root.services.workloads.cancel({ caller: await root.principalFor(root.ownerId), id: workloadId });

  expect(await stagedEntries(root)).toEqual([]);
});

test("a queued cancel frees only the row owner's upload, and a foreign caller frees nothing", async () => {
  await using root = await harness();
  const member = await root.actor();
  const caller = await root.principalFor(member.id);
  const stagedDir = "import-tree-member";
  await plantOrphan(root, stagedDir, member.id);
  const ownerRun = await admit(root, folder(root), [TREE_DRY_RUN_VALUE]);
  const ownerTree = await stagedEntries(root);
  const memberRun = await root.services.workloads.start({ input: { kind: "import-st", params: { stagedDir } }, caller, mode: "singular", ownerId: member.id });

  await expect(root.services.workloads.cancel({ caller, id: ownerRun })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await stagedEntries(root)).toEqual(ownerTree);

  await root.services.workloads.cancel({ caller, id: memberRun.id });

  expect(await stagedEntries(root, member.id)).toEqual([]);
  expect(await stagedEntries(root)).toEqual(ownerTree);
});

test("a member who queues a row naming another account's upload and cancels it frees nothing of theirs", async () => {
  await using root = await harness();
  const member = await root.actor();
  const caller = await root.principalFor(member.id);
  const ownerRun = await admit(root, folder(root));
  const ownerTree = await stagedEntries(root);
  const stagedDir = basename(await stagedTree(root));

  const forged = await root.services.workloads.start({ input: { kind: "import-st", params: { stagedDir } }, caller, mode: "singular", ownerId: member.id });
  expect(await root.services.workloads.cancel({ caller, id: forged.id })).toEqual({ status: "cancelled" });

  expect(await stagedEntries(root)).toEqual(ownerTree);
  await finish(root, ownerRun);
});

test("a row cancelled mid-run frees its tree through the run's own cleanup", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  const caller = await root.principalFor(root.ownerId);
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  const contribution = root.app.workloadContributions["import-st"];
  const realRun = contribution.run.bind(contribution);
  const stop = new AbortController();
  using run = vi.spyOn(contribution, "run").mockImplementationOnce(async (...args) => {
    expect(await root.services.workloads.cancel({ caller, id })).toEqual({ status: "cancelling" });
    expect(await stagedEntries(root)).not.toEqual([]);
    // The cancel poll is off under the harness, so this is the abort it would raise.
    stop.abort();
    return await realRun(...args);
  });

  await root.runAdmittedWorkload(id, stop.signal);

  expect(run).toHaveBeenCalledOnce();
  expect(await root.services.workloads.get({ caller, id })).toMatchObject({ status: "cancelled" });
  expect(await stagedEntries(root)).toEqual([]);
});

test("a boot frees what no live row names, across accounts, and nothing it did not stage", async () => {
  await using root = await harness();
  const member = await root.actor();
  await plantOrphan(root, `${STAGED_TREE_PREFIX}dead`);
  await plantOrphan(root, `${STAGED_BUNDLE_PREFIX}dead.zip`);
  await plantOrphan(root, `${ZIP_STAGING_PREFIX}dead`);
  await plantOrphan(root, `${STAGED_TREE_PREFIX}dead`, member.id);
  const foreign = await plantOrphan(root, "operator-notes");
  const stray = join(root.importStagingDir, "import-tree-not-under-an-owner");
  await mkdir(stray, { recursive: true });

  await reboot(root);

  expect(await readdir(root.stagedImportsOf(root.ownerId))).toEqual(["operator-notes"]);
  expect(await readdir(foreign)).toEqual(["left-behind.txt"]);
  expect(await stagedEntries(root, member.id)).toEqual([]);
  expect(await readdir(root.importStagingDir)).toContain("import-tree-not-under-an-owner");
});

test("a boot leaves a queued run's tree, and that run then imports it", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  const tree = await stagedTree(root);

  await reboot(root);

  expect(await stagedTree(root)).toBe(tree);
  await finish(root, id);
  expect(await stagedEntries(root)).toEqual([]);
});

test("a boot leaves the tree of a run its process died under, and the re-queued run imports it", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  const tree = await stagedTree(root);
  // The row a kill leaves behind: nothing but the dead process could have moved it here.
  await root.db.update(workloads).set({ status: "running" }).where(eq(workloads.id, id));

  await reboot(root);

  expect(await stagedTree(root)).toBe(tree);
  await finish(root, id);
});

test("a boot frees a cancelled row's tree that a failed release left behind", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  await root.db.update(workloads).set({ status: "cancelled" }).where(eq(workloads.id, id));

  await reboot(root);

  expect(await stagedEntries(root)).toEqual([]);
});

test("a boot keeps the upload a queued row names even when this build cannot parse that row", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  const tree = await stagedTree(root);
  const stagedDir = basename(tree);
  await root.db
    .update(workloads)
    .set({ params: { stagedDir, dryRun: "not a boolean" } })
    .where(eq(workloads.id, id));

  await reboot(root);

  expect(await stagedTree(root)).toBe(tree);
});

test("a boot frees nothing when a live row's params will not decode, and still boots", async () => {
  await using root = await harness();
  const id = await admit(root, folder(root));
  await root.db.run(sql`UPDATE ${workloads} SET params = 'not json' WHERE id = ${id}`);
  const tree = await stagedTree(root);

  await reboot(root);

  expect(await stagedTree(root)).toBe(tree);
});

test("a boot follows no link under the staging root", async () => {
  await using root = await harness();
  const outside = join(root.importStagingDir, "..", "outside-staging");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "import-tree-kept"), "kept");
  await mkdir(root.importStagingDir, { recursive: true });
  await symlink(outside, join(root.importStagingDir, "linked-owner"));
  await mkdir(root.stagedImportsOf(root.ownerId), { recursive: true });
  await symlink(outside, join(root.stagedImportsOf(root.ownerId), "import-tree-linked"));

  await reboot(root);

  expect(await readdir(outside)).toEqual(["import-tree-kept"]);
});

test("a boot on a box that never staged anything passes", async () => {
  await using root = await harness();
  await expect(reboot(root)).resolves.toBeUndefined();
});
