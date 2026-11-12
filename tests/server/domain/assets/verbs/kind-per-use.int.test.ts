// A kind belongs to each use of a stored file: the same picture stored under two kinds is found by each kind's
// reader, whichever kind it was stored under first.
// @subject packages/server/src/domain/assets/persistence/queries.ts
// @subject packages/server/src/domain/settings/persistence/queries.ts
// @subject packages/db/src/query/asset-kinds.ts
import type { AssetKind } from "@orb/contracts/assets";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";

const MIME = "image/png";
const ORDERS: readonly (readonly [first: AssetKind, second: AssetKind])[] = [
  ["attachment", "background"],
  ["background", "attachment"],
  ["gallery", "avatar"],
  ["avatar", "gallery"],
];

test.for(ORDERS)("a picture stored as %s and then as %s is one asset each kind's list finds", async ([first, second]) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const bytes = magicBytes("png");
  const stored = await root.services.assets.store({ principal, bytes, kind: first, mime: MIME, enforceMagic: true });
  const again = await root.services.assets.store({ principal, bytes, kind: second, mime: MIME, enforceMagic: true });

  expect(again).toEqual({ assetId: stored.assetId, hash: stored.hash, created: false });
  for (const kind of [first, second]) {
    const listed = await root.services.assets.listOwned({ principal, kind, limit: 10 });
    expect(listed.map((row) => row.assetId)).toEqual([stored.assetId]);
    expect([...(listed[0]?.kinds ?? [])].toSorted()).toEqual([first, second].toSorted());
  }
  expect(await root.services.assets.listOwned({ principal, kind: "document", limit: 10 })).toEqual([]);
});

test.for([
  ["attachment", "background"],
  ["background", "attachment"],
] as const)("a picture stored as %s and then as %s can be pinned as the background", async ([first, second]) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const bytes = magicBytes("png");
  const stored = await root.services.assets.store({ principal, bytes, kind: first, mime: MIME, enforceMagic: true });
  await root.services.assets.store({ principal, bytes, kind: second, mime: MIME, enforceMagic: true });

  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { backgroundImageKind: "asset", backgroundAssetId: stored.assetId } });
  expect((await caller.settings.getUserSettings()).config.appearance.backgroundAssetId).toBe(stored.assetId);
});

test("a picture never stored as a background is refused as the background pin", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const stored = await root.services.assets.store({ principal, bytes: magicBytes("png"), kind: "attachment", mime: MIME, enforceMagic: true });

  await expect(
    caller.settings.updateUserSettingsSection({ section: "appearance", patch: { backgroundImageKind: "asset", backgroundAssetId: stored.assetId } }),
  ).rejects.toThrow(/background asset is no longer available/u);
  expect((await caller.settings.getUserSettings()).config.appearance.backgroundAssetId).not.toBe(stored.assetId);
});

test.for([
  ["attachment", "avatar", []],
  ["avatar", "attachment", ["avatar"]],
] as const)("a picture stored as %s and then as %s is in the embeddable sweep", async ([first, second, sweptAfterFirst]) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const bytes = magicBytes("png");
  const stored = await root.services.assets.store({ principal, bytes, kind: first, mime: MIME, enforceMagic: true });
  expect(await root.services.assets.listImageAssetIds(root.ownerId)).toHaveLength(sweptAfterFirst.length);
  await root.services.assets.store({ principal, bytes, kind: second, mime: MIME, enforceMagic: true });

  expect(await root.services.assets.listImageAssetIds(root.ownerId)).toEqual([stored.assetId]);
});
