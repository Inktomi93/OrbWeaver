// @subject packages/server/src/domain/persona/persistence/import-write.ts
// The bulk persona import writes a persona's avatar like the create and update verbs do: only the owner's asset of a
// picture kind, any other kind refused with the same code and no persona written.
import { ASSET_UPLOAD_REFUSAL_CODES } from "@orb/contracts/assets";
import type { BulkImportPersonaInput } from "@orb/contracts/persona";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { createBulkImportPersonas } from "@orb/server/domain/persona";
import { expect, test } from "@orb/testkit/node";
import { magicBytes, principal } from "@orb/testkit/node/helpers";

const PDF = new TextEncoder().encode("%PDF-1.4\n%not a picture\n");

function imported(name: string, avatarAssetId: AssetId): BulkImportPersonaInput {
  return { name, description: "Imported from a profile.", avatarAssetId, metadata: null, isDefault: false };
}

test("the bulk persona import refuses a document asset as an avatar with its code, and imports a picture", async ({ harness, db, services }) => {
  const owner = await principal(harness, (await harness.actor()).id);
  const picture = await services.assets.store({ principal: owner, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const document = await services.assets.store({ principal: owner, bytes: PDF, kind: "document", mime: "application/pdf" });
  const bulkImport = createBulkImportPersonas({
    db: databaseHandle(db),
    now: harness.clock.now,
    newPersonaId: () => harness.idSource.typeId(ID_PREFIX.persona),
  });

  await expect(bulkImport({ ownerId: owner.userId, personas: [imported("Wanderer", document.assetId)] })).rejects.toMatchObject({
    code: ASSET_UPLOAD_REFUSAL_CODES.notAnImage,
  });
  expect(await services.persona.list({ principal: owner })).toEqual([]);

  expect((await bulkImport({ ownerId: owner.userId, personas: [imported("Wanderer", picture.assetId)] })).personasCreated).toBe(1);
  expect(await services.persona.list({ principal: owner })).toMatchObject([{ name: "Wanderer", avatarAssetId: picture.assetId }]);
});
