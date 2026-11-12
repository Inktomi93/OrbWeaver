// @subject packages/server/src/domain/character/persistence/queries.ts
// A character's avatar is drawn as a picture wherever the character appears, so the create and update writes link
// only the owner's asset of a picture kind; any other kind is refused with its code and nothing is linked.
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import { createCharacterSchema, updateCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";

type Owner = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

const PDF = new TextEncoder().encode("%PDF-1.4\n%not a picture\n");

async function ownedAssets(harness: ServerTestHarness, owner: Owner): Promise<{ readonly picture: string; readonly document: string }> {
  const picture = await harness.app.assets.store({ principal: owner, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const document = await harness.app.assets.store({ principal: owner, bytes: PDF, kind: "document", mime: "application/pdf" });
  return { picture: picture.assetId, document: document.assetId };
}

test("creating a character with a document asset as its avatar is refused with its code, and a picture is linked", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);
  const input = (avatarAssetId: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId });

  await expect(harness.services.character.create({ principal: owner, input: input(document) })).rejects.toMatchObject({
    code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
  });
  expect(await harness.services.character.list({ principal: owner, limit: 10 })).toMatchObject({ items: [] });
  expect((await harness.services.character.create({ principal: owner, input: input(picture) })).avatarAssetId).toBe(picture);
});

test("updating a character's avatar to a document asset is refused with its code, and the avatar stays", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light.", avatarAssetId: picture }),
  });

  await expect(
    harness.services.character.update({ principal: owner, characterId: card.id, input: updateCharacterSchema.parse({ avatarAssetId: document }) }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage });
  expect((await harness.services.character.get({ principal: owner, characterId: card.id })).avatarAssetId).toBe(picture);
});
