// @subject packages/server/src/domain/persona/persistence/queries.ts
// A persona's avatar is drawn as a picture wherever the persona speaks, so the create and update writes link only the
// owner's asset of a picture kind; any other kind is refused with its code and nothing is linked.
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import { createPersonaSchema, updatePersonaSchema } from "@orb/contracts/persona";
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

test("creating a persona with a document asset as its avatar is refused with its code, and a picture is linked", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);

  await expect(
    harness.services.persona.create({ principal: owner, input: createPersonaSchema.parse({ name: "Wanderer", description: "", avatarAssetId: document }) }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage });
  const created = await harness.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name: "Wanderer", description: "", avatarAssetId: picture }),
  });
  expect(created.avatarAssetId).toBe(picture);
});

test("updating a persona's avatar to a document asset is refused with its code, and the avatar stays", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const { picture, document } = await ownedAssets(harness, owner);
  const persona = await harness.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name: "Wanderer", description: "", avatarAssetId: picture }),
  });

  await expect(
    harness.services.persona.update({ principal: owner, personaId: persona.id, input: updatePersonaSchema.parse({ avatarAssetId: document }) }),
  ).rejects.toMatchObject({ code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage });
  expect((await harness.services.persona.get({ principal: owner, personaId: persona.id })).avatarAssetId).toBe(picture);
});
