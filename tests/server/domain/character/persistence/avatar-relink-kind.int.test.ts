// @subject packages/server/src/domain/character/persistence/avatar-link-write.ts
// The avatar backfill's relink writes a character's avatar pointer like the create and update verbs do: only the
// owner's asset of a picture kind, any other kind refused with the same code and nothing linked.
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createLinkCharacterAvatars } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node";
import { magicBytes, principal } from "@orb/testkit/node/helpers";

const PDF = new TextEncoder().encode("%PDF-1.4\n%not a picture\n");

test("the backfill relink refuses a document asset as a character's avatar with its code, and links a picture", async ({ harness, db, services }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const card = await services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamp keeper", handle: "lamp-keeper", description: "Keeps the light." }),
  });
  const picture = await services.assets.store({ principal: owner, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const document = await services.assets.store({ principal: owner, bytes: PDF, kind: "document", mime: "application/pdf" });
  const relink = createLinkCharacterAvatars({ db: databaseHandle(db), now: harness.clock.now });

  await expect(relink({ ownerId: owner.userId, links: [{ characterId: card.id, assetId: document.assetId }] })).rejects.toMatchObject({
    code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
  });
  expect((await services.character.get({ principal: owner, characterId: card.id })).avatarAssetId).toBeNull();

  await relink({ ownerId: owner.userId, links: [{ characterId: card.id, assetId: picture.assetId }] });
  expect((await services.character.get({ principal: owner, characterId: card.id })).avatarAssetId).toBe(picture.assetId);
});
