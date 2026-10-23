// @subject packages/server/src/domain/character/persistence/gallery-character.ts
// @subject packages/server/src/domain/assets/verbs/export-gallery.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { PortableFile } from "@orb/contracts/portability";
import { galleryItems } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { createGalleryCharacterOps } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node";
import { seedCharacter, seedUser } from "@orb/testkit/node/composed";
import { magicBytes, principal } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";

const OWNED_SUBJECT = createCharacterSchema.parse({ handle: "owned-gallery-subject", name: "Owned subject", description: "" });
const FOREIGN_SUBJECT = createCharacterSchema.parse({ handle: "foreign-gallery-subject", name: "Foreign subject", description: "" });

test("composed gallery export never resolves a foreign subject handle even from an owned curation row", async ({ harness, app, db, services }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const { row: owned } = await seedCharacter(harness, { principal: await principal(harness, owner.id), input: OWNED_SUBJECT });
  const { row: foreign } = await seedCharacter(harness, { principal: await principal(harness, other.id), input: FOREIGN_SUBJECT });
  const image = await services.assets.store({ principal: await principal(harness, owner.id), bytes: magicBytes("png"), kind: "gallery", mime: "image/png" });
  const item = await services.assets.addToGallery({ principal: await principal(harness, owner.id), assetId: image.assetId, subjectCharacterId: owned.id });
  await expect(
    services.assets.addToGallery({ principal: await principal(harness, owner.id), assetId: image.assetId, subjectCharacterId: foreign.id }),
  ).rejects.toThrow();
  await db.update(galleryItems).set({ subjectCharacterId: foreign.id }).where(eq(galleryItems.id, item.galleryItemId));
  const gallery = app.portability.find((entity) => entity.kind === "gallery");
  if (gallery === undefined) {
    throw new Error("composed gallery descriptor is missing");
  }
  const files: PortableFile[] = [];
  for await (const file of gallery.exportAll(owner.id)) {
    files.push(file);
  }
  expect(files.map((file) => file.filename)).toEqual(["gallery.json"]);
  const text = new TextDecoder().decode(files[0]?.bytes);
  expect(JSON.parse(text)).toMatchObject({ items: [{ assetId: image.assetId, subjectCharacterHandle: null, createdAt: item.createdAt }] });
  expect(text).not.toContain(foreign.handle);
  const ops = createGalleryCharacterOps(databaseHandle(db), services.character);
  expect(await ops.resolveCharacterHandle(owner.id, owned.id)).toBe(owned.handle);
  expect(await ops.resolveCharacterHandle(owner.id, foreign.id)).toBeNull();
});

test("composed gallery import relinks only the importing owner's handle and preserves null fallback", async ({ harness, app, db, services }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const { row: owned } = await seedCharacter(harness, { principal: await principal(harness, owner.id), input: OWNED_SUBJECT });
  const { row: foreign } = await seedCharacter(harness, { principal: await principal(harness, other.id), input: FOREIGN_SUBJECT });
  const image = await services.assets.store({ principal: await principal(harness, owner.id), bytes: magicBytes("png"), kind: "gallery", mime: "image/png" });
  const gallery = app.portability.find((entity) => entity.kind === "gallery");
  if (gallery === undefined) {
    throw new Error("composed gallery descriptor is missing");
  }
  const item = await services.assets.addToGallery({ principal: await principal(harness, owner.id), assetId: image.assetId, subjectCharacterId: owned.id });
  const files: PortableFile[] = [];
  for await (const file of gallery.exportAll(owner.id)) {
    files.push(file);
  }
  const file = files[0];
  if (file === undefined) {
    throw new Error("composed gallery produced no file");
  }
  await services.assets.removeFromGallery({ principal: await principal(harness, owner.id), galleryItemId: item.galleryItemId });
  expect(await gallery.importFile(owner.id, file)).toEqual({ ok: true, created: true });
  const text = new TextDecoder().decode(file.bytes);
  expect(text.split(owned.handle)).toHaveLength(2);
  expect(await gallery.importFile(owner.id, { ...file, bytes: new TextEncoder().encode(text.replace(owned.handle, foreign.handle)) })).toEqual({
    ok: true,
    created: true,
  });
  const rows = await services.assets.listGallery({ principal: await principal(harness, owner.id), limit: 100 });
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.subjectCharacterId))).toEqual(new Set([null, owned.id]));
});
