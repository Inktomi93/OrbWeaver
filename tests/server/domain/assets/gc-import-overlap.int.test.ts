// A restore writes its blobs before the rows that reference them. The scheduled sweep never runs beside a
// restore in either order, and the held row never head-blocks its lane, so no restored blob is reclaimed in the gap.
// @subject packages/server/src/domain/assets/workload-contributions.ts
// @subject packages/server/src/domain/workloads/persistence/queries.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts

import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import type { CharacterHandle, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createQueueScanner, freshHeldDb } from "@orb/testkit/node/composed";
import type { GcBox, StoredRef } from "./gc-box.ts";
import { ageOnly, attach, aWeekAgo, dispatch, openBox, openRoom, stampEveryBlob, startGc, store, survives, workloadRow } from "./gc-box.ts";

const EXPORT_ROUTE = "/api/export/library";
const BUNDLE_ROUTE = "/api/import/bundle";
/** The first statement of the character plane, which the loader reaches only after every blob has landed. */
const CHARACTER_PLANE = /from "characters"/i;
/** The sweep's destructive edge: it reaches this only once it has judged a blob garbage. */
const ASSET_ROW_DELETE = /^delete from "assets"/i;
const SOURCE_ID_CURSOR = 2 ** 29;
/** The card restores under the handle it exported, and the chat re-links to its character by that handle. */
const RESTORED_HANDLE = "keeper";

interface Backup {
  readonly bundle: Uint8Array;
  /** Referenced only by a chat message, which the restore writes last. */
  readonly attachment: StoredRef;
}

/** A library export from another box whose one attachment is referenced only by a chat message. */
async function backup(): Promise<Backup> {
  // Its own id band: asset ids are restored verbatim, and the target mints its own from the fixture band.
  const source = await openBox(undefined, { loopbackOwner: true, ids: createSeededIds(SOURCE_ID_CURSOR) });
  const attachment = await store(source, "attachment");
  await attach(source, await openRoom(source, castId<CharacterHandle>(RESTORED_HANDLE)), attachment);
  const download = await source.root.http.request(EXPORT_ROUTE);
  expect(download.status).toBe(200);
  return { bundle: new Uint8Array(await download.arrayBuffer()), attachment };
}

async function uploadBundle(box: GcBox, bytes: Uint8Array): Promise<WorkloadId> {
  const response = await box.root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: bytes });
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

async function restoreOutcome(box: GcBox, id: WorkloadId): Promise<{ readonly status: string; readonly failed: number | undefined } | null> {
  const row = await workloadRow(box, id);
  return row.kind === "import-bundle" && !row.poison ? { status: row.status, failed: row.result?.failed } : null;
}

interface RestoreInFlight {
  readonly target: GcBox;
  readonly attachment: StoredRef;
  /** An unreferenced blob of the target's own, aged with the rest. */
  readonly garbage: StoredRef;
  readonly restore: WorkloadId;
  /** Let the restore write its referencing rows and settle. */
  readonly finish: () => Promise<void>;
}

/** A restore parked after its blobs landed and before any row references them, past the grace window. */
async function restoreInFlight(): Promise<RestoreInFlight> {
  const { bundle, attachment } = await backup();
  const { db, hold } = await freshHeldDb();
  const target = await openBox(db, { loopbackOwner: true });
  const garbage = await store(target, "attachment");
  const restoring = hold(CHARACTER_PLANE);
  const restore = await uploadBundle(target, bundle);
  const restored = dispatch(target, restore);
  await restoring.reached;
  // Only the restore's own statement waits; the sweep reads the same table.
  restoring.disarm();
  // The restore has outrun the grace window: its blobs are a week old and nothing references them yet.
  await stampEveryBlob(target, aWeekAgo(target));
  return {
    target,
    attachment,
    garbage,
    restore,
    finish: async (): Promise<void> => {
      restoring.release();
      await restored;
    },
  };
}

test("a sweep due while a restore is still writing waits for it, and every restored blob survives", async () => {
  const { target, attachment, garbage, restore, finish } = await restoreInFlight();
  const sweep = await startGc(target);
  await dispatch(target, sweep);
  const sweepBesideRestore = (await workloadRow(target, sweep)).status;
  await finish();
  await dispatch(target, sweep);

  expect({
    sweepBesideRestore,
    restore: await restoreOutcome(target, restore),
    sweep: (await workloadRow(target, sweep)).status,
    restoredAttachment: await survives(target, attachment),
    // Positive control: the sweep that finally ran does reclaim, so the survival above is the exclusion's doing.
    garbage: await survives(target, garbage),
  }).toEqual({ sweepBesideRestore: "queued", restore: { status: "succeeded", failed: 0 }, sweep: "succeeded", restoredAttachment: true, garbage: false });
});

test("a restore uploaded while the sweep is reclaiming waits for the sweep to finish", async () => {
  const { bundle, attachment } = await backup();
  const { db, hold } = await freshHeldDb();
  const target = await openBox(db, { loopbackOwner: true });
  const garbage = await store(target, "attachment");
  await ageOnly(target, garbage);
  const reclaiming = hold(ASSET_ROW_DELETE);
  const sweep = await startGc(target);
  const swept = dispatch(target, sweep);
  await reclaiming.reached;
  reclaiming.disarm();
  const restore = await uploadBundle(target, bundle);
  await dispatch(target, restore);
  const restoreBesideSweep = await restoreOutcome(target, restore);
  reclaiming.release();
  await swept;
  await dispatch(target, restore);

  expect({
    restoreBesideSweep,
    sweep: (await workloadRow(target, sweep)).status,
    restore: await restoreOutcome(target, restore),
    restoredAttachment: await survives(target, attachment),
    garbage: await survives(target, garbage),
  }).toEqual({
    restoreBesideSweep: { status: "queued", failed: undefined },
    sweep: "succeeded",
    restore: { status: "succeeded", failed: 0 },
    restoredAttachment: true,
    garbage: false,
  });
});

test("the held sweep is skipped in its lane's queue, so the rows behind it still run", async () => {
  const { target, restore, finish } = await restoreInFlight();
  const sweep = await startGc(target);
  const integrity = await target.root.services.workloads.start({
    caller: target.principal,
    mode: "bulk",
    ownerId: target.root.ownerId,
    input: { kind: "assets-fsck", params: {} },
  });
  const nextRunnable = createQueueScanner(target.root);
  const besideRestore = (await nextRunnable(target.root.clock.now(), "sweep"))?.id;
  await finish();
  // Positive control: once the restore is done, the sweep heads the lane again, ahead of the row queued after it.
  const afterRestore = (await nextRunnable(target.root.clock.now(), "sweep"))?.id;

  expect({ besideRestore, afterRestore, restore: await restoreOutcome(target, restore) }).toEqual({
    besideRestore: integrity.id,
    afterRestore: sweep,
    restore: { status: "succeeded", failed: 0 },
  });
});
