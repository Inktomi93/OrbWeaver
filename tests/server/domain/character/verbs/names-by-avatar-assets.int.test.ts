// A by-ids name read: the caller's characters named by the avatar asset ids they hold, owner-scoped in the query.
// @subject packages/server/src/domain/character/verbs/names-by-avatar-assets.ts
// @subject packages/server/src/transport/trpc/routers/character.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, seedCorpusActors } from "@orb/testkit/node/composed";

async function characterWithAvatar(root: ServerTestHarness, ownerId: ServerTestHarness["ownerId"], handle: string, name: string): Promise<AssetId> {
  const principal = await root.principalFor(ownerId);
  const avatar = await root.services.assets.store({
    principal,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    kind: "avatar",
    mime: "image/png",
    enforceMagic: true,
  });
  await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle, name, description: "A keeper.", avatarAssetId: avatar.assetId }),
  });
  return avatar.assetId;
}

test("avatar asset ids resolve to the caller's own characters only, and an id nobody wears is absent", async () => {
  await using root = await createServerHarness();
  const { secondUserId } = await seedCorpusActors(root);
  const mine = await characterWithAvatar(root, root.ownerId, "loom-keeper", "Loom Keeper");
  const theirs = await characterWithAvatar(root, secondUserId, "ledger-keeper", "Ledger Keeper");
  const caller = await root.internalCallerFor(root.ownerId);
  const secondCaller = await root.internalCallerFor(secondUserId);
  const unworn = root.idSource.typeId(ID_PREFIX.asset);

  expect(await caller.character.namesByAvatarAssets({ assetIds: [mine, theirs, unworn] })).toEqual([{ assetId: mine, name: "Loom Keeper" }]);
  // Positive control: the other owner's own read names the avatar the first read withheld.
  expect(await secondCaller.character.namesByAvatarAssets({ assetIds: [mine, theirs] })).toEqual([{ assetId: theirs, name: "Ledger Keeper" }]);
  expect(await caller.character.namesByAvatarAssets({ assetIds: [] })).toEqual([]);
});
