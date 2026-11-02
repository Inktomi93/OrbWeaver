// The assets-rebuild-index workload on the real composition root: only the box owner may start it, and a run
// re-derives index rows, as the chosen asset kind, for blobs on disk that no row names.
// @subject packages/server/src/domain/assets/verbs/rebuild-from-tree.ts
// @subject packages/server/src/domain/assets/workload-contributions.ts

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { forged } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes } from "@orb/testkit/node/composed";
import { dispatch, openBox, store, workloadRow } from "../gc-box.ts";

test("an owner's rebuild re-indexes an orphan blob as the chosen kind and reports it, and a rebuilt row is left alone by a second run", async () => {
  const box = await openBox();
  const kept = await store(box, "gallery");
  const orphan = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset));
  await box.cas.putBytes(box.root.ownerId, orphan, box.root.clock.now());
  const owned = async (): Promise<readonly string[]> =>
    (await box.root.services.assets.listOwned({ principal: box.principal, kind: "avatar", limit: 10 })).map((item) => item.hash);
  expect(await owned()).toEqual([]);

  const caller = await box.root.internalCallerFor(box.root.ownerId);
  const first = await caller.workloads.start({ input: { kind: "assets-rebuild-index", params: { kind: "avatar" } }, mode: "bulk" });
  await dispatch(box, first.id);

  expect(await workloadRow(box, first.id)).toMatchObject({ status: "succeeded", result: { scanned: 2, changed: 1, dryRun: false } });
  expect(await owned()).toHaveLength(1);
  // The blob that already had a row keeps its own kind.
  expect(await box.root.services.assets.assetCasRefById(kept.assetId)).toMatchObject({ hash: kept.hash });

  const second = await caller.workloads.start({ input: { kind: "assets-rebuild-index", params: { kind: "avatar" } }, mode: "bulk" });
  await dispatch(box, second.id);
  expect(await workloadRow(box, second.id)).toMatchObject({ status: "succeeded", result: { scanned: 2, changed: 0 } });
});

test("a files folder whose owner is not a user is skipped and counted, and the later owners still rebuild", async () => {
  const box = await openBox();
  const ghost = castId<UserId>("ghost-owner-folder");
  await box.cas.putBytes(ghost, makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset)), box.root.clock.now());
  await box.cas.putBytes(box.root.ownerId, makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset)), box.root.clock.now());

  const caller = await box.root.internalCallerFor(box.root.ownerId);
  const run = await caller.workloads.start({ input: { kind: "assets-rebuild-index", params: { kind: "avatar" } }, mode: "bulk" });
  await dispatch(box, run.id);

  const row = await workloadRow(box, run.id);
  expect(row).toMatchObject({ status: "succeeded", result: { scanned: 2, changed: 1, failed: 1, dryRun: false } });
  // The result carries counts only: no driver error text reaches it.
  expect(JSON.stringify(row)).not.toMatch(/FOREIGN KEY|constraint|SQLITE|insert into/i);
  expect(await box.root.services.assets.listOwned({ principal: box.principal, kind: "avatar", limit: 10 })).toHaveLength(1);
});

test("a member cannot start the rebuild, which is bulk-only like the garbage collector, and nothing is queued", async () => {
  const box = await openBox();
  const member = await box.root.internalCallerFor((await box.root.actor()).id);
  const owner = await box.root.internalCallerFor(box.root.ownerId);
  const before = await owner.workloads.list();
  await expect(member.workloads.start({ input: { kind: "assets-rebuild-index", params: { kind: "avatar" } }, mode: "bulk" })).toThrowTRPCError("FORBIDDEN");
  await expect(member.workloads.start({ input: { kind: "assets-rebuild-index", params: { kind: "avatar" } }, mode: "singular" })).toThrowTRPCError(
    "BAD_REQUEST",
  );
  expect(await owner.workloads.list()).toEqual(before);
});

test("an unknown asset kind is refused at the door", async () => {
  const box = await openBox();
  const owner = await box.root.internalCallerFor(box.root.ownerId);
  await expect(owner.workloads.start({ input: forged<never>({ kind: "assets-rebuild-index", params: { kind: "nonsense" } }), mode: "bulk" })).toThrowTRPCError(
    "BAD_REQUEST",
  );
});
