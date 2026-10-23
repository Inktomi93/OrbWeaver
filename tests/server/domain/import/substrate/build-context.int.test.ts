// @subject packages/server/src/domain/import/verbs/portable-imports.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// The owner binders drive the genuine services and database; foreign arguments cannot replace the authenticated authority.
import { createCharacterSchema } from "@orb/contracts/character";
import { characters, characterTags, tags } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { isOwner } from "@orb/server/domain/admin";
import { createImportAvatarStore } from "@orb/server/domain/assets";
import { createCharacterImportOps } from "@orb/server/domain/character";
import { buildImportContext, createInstallerCharacterImport } from "@orb/server/domain/import";
import { createImportedCardTag } from "@orb/server/domain/tag";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { expect, OWNER_USER_ID, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

test("owner binders retain Principal identity and ignore foreign owner arguments through real character/tag writes", async ({
  db,
  services,
  ownerCaller,
  harness,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const actor = await harness.principalFor(OWNER_USER_ID);
  const foreignOwner = (await harness.actor()).id;
  const created = vi.spyOn(services.character, "create");
  const ctx = buildImportContext({
    principal: actor,
    characterOps: createCharacterImportOps(actor, services.character),
    storeAsset: createImportAvatarStore(actor, (args) => services.assets.store(args)),
    attachCardTag: createImportedCardTag(actor.userId, (args) => services.tag.attachCardTagByName(args)),
  });
  const input = createCharacterSchema.parse({ handle: "authority-control", name: "Authority control", description: "Owned card" });
  const ref = await ctx.createCharacter({ ownerId: foreignOwner, input, importedFrom: "authority.json", importHash: "authority-hash" });
  expect(created.mock.calls[0]?.[0].principal).toBe(actor);
  expect((await db.select().from(characters).where(eq(characters.id, ref.characterId)))[0]?.ownerId).toBe(actor.userId);
  expect(await ctx.findByImportHash({ ownerId: foreignOwner, importHash: "authority-hash" })).toBe(ref.characterId);
  expect(await ctx.findByHandle({ ownerId: foreignOwner, handle: input.handle })).toBe(ref.characterId);
  expect(await ctx.findByName({ ownerId: foreignOwner, name: input.name })).toEqual([ref.characterId]);
  await ctx.attachCardTag({ ownerId: foreignOwner, characterId: ref.characterId, tagName: "author-tag" });
  const attachment = (await db.select().from(characterTags).where(eq(characterTags.characterId, ref.characterId)))[0];
  expect(attachment).toMatchObject({ status: "accepted" });
  if (attachment === undefined) {
    throw new Error("the real attach did not create its junction");
  }
  expect((await db.select().from(tags).where(eq(tags.id, attachment.tagId)))[0]).toMatchObject({ ownerId: actor.userId, source: "card" });
  expect(await services.tag.listAttachedEntities({ principal: actor, tagId: attachment.tagId, targetType: "character" })).toEqual({
    entities: [{ targetType: "character", targetId: ref.characterId, name: input.name }],
    hasMore: false,
  });
  expect(Object.hasOwn(ctx, "importLorebook")).toBe(false);
});

test("the real import parser refuses malformed bytes before any owner-bound effect", async ({ harness, services, ownerCaller }): Promise<void> => {
  await ownerCaller.character.list({});
  const descriptor = harness.app.portability.find((entity) => entity.kind === "character");
  if (descriptor === undefined) {
    throw new Error("the real graph omitted its character import operation");
  }
  const create = vi.spyOn(services.character, "create");
  const store = vi.spyOn(services.assets, "store");
  const attach = vi.spyOn(services.tag, "attachCardTagByName");
  expect(await descriptor.importFile(OWNER_USER_ID, { filename: "malformed.json", bytes: new TextEncoder().encode("not a card") })).toMatchObject({
    ok: false,
  });
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
  const bytes = new TextEncoder().encode(
    '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Parser control","description":"Owned card","first_mes":"Hello"}}',
  );
  expect(await descriptor.importFile(OWNER_USER_ID, { filename: "control.json", bytes })).toMatchObject({ ok: true, created: true });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[0].principal.userId).toBe(OWNER_USER_ID);
  expect(await services.character.count({ principal: await harness.principalFor(OWNER_USER_ID) })).toBe(1);
});

test("the installer factory uses the row-resolved role and the real import funnel for provenance and byte-identical reingest", async ({
  services,
  ownerCaller,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const resolvePrincipal = vi.fn(createHostPrincipalResolver(services.sessions));
  const create = vi.spyOn(services.character, "create");
  const run = createInstallerCharacterImport({
    resolvePrincipal,
    contextFor: (actor) =>
      buildImportContext({
        principal: actor,
        characterOps: createCharacterImportOps(actor, services.character),
        storeAsset: createImportAvatarStore(actor, (args) => services.assets.store(args)),
        attachCardTag: createImportedCardTag(actor.userId, (args) => services.tag.attachCardTagByName(args)),
      }),
  });
  const pluginId = mintTypeId(ID_PREFIX.plugin);
  const bytes = new TextEncoder().encode(
    '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Installer role control","description":"Owned imported card","first_mes":"Hello"}}',
  );
  const first = await run(OWNER_USER_ID, bytes, pluginId);
  const original = await resolvePrincipal.mock.results[0]?.value;
  expect(create.mock.calls[0]?.[0].principal).toBe(original);
  expect(first.created).toBe(true);
  if (original === undefined) {
    throw new Error("the real row resolver was not called");
  }
  expect(isOwner(original)).toBe(true);
  expect((await services.character.get({ principal: original, characterId: first.characterId })).provenance).toBe("imported");
  expect(await run(OWNER_USER_ID, bytes, pluginId)).toEqual({ ...first, created: false });
});
