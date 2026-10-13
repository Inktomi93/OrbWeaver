// The owner binders drive the genuine services and database; foreign arguments cannot replace the authenticated authority.
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { characters, characterTags, tags } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createImportAvatarStore } from "@orb/server/domain/assets";
import { createCharacterImportOps } from "@orb/server/domain/character";
import { buildImportContext, createImportService, createInstallerCharacterImport } from "@orb/server/domain/import";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { seedUser } from "@orb/testkit/node/factories/user.ts";
import { expect, OWNER_USER_ID, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { createImportedCardTag } from "#server/domain/tag/index.ts";

test("owner binders retain Principal identity and ignore foreign owner arguments through real character/tag writes", async ({
  db,
  services,
  ownerCaller,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const actor = principal(OWNER_USER_ID, { role: "owner", via: "header" });
  const foreignOwner = (await seedUser(db)).id;
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

test("the real import parser refuses malformed bytes before any owner-bound effect", async ({ services, ownerCaller }): Promise<void> => {
  await ownerCaller.character.list({});
  const actor = principal(OWNER_USER_ID, { role: "owner", via: "header" });
  const create = vi.spyOn(services.character, "create");
  const store = vi.spyOn(services.assets, "store");
  const attach = vi.spyOn(services.tag, "attachCardTagByName");
  const ctx = buildImportContext({
    principal: actor,
    characterOps: createCharacterImportOps(actor, services.character),
    storeAsset: createImportAvatarStore(actor, (args) => services.assets.store(args)),
    attachCardTag: createImportedCardTag(actor.userId, (args) => services.tag.attachCardTagByName(args)),
  });
  await expect(createImportService(ctx).importCharacter({ card: { bytes: new TextEncoder().encode("not a card") } })).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
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
  expect(original?.role).toBe("owner");
  expect(create.mock.calls[0]?.[0].principal).toBe(original);
  expect(first.created).toBe(true);
  if (original === undefined) {
    throw new Error("the real row resolver was not called");
  }
  expect((await services.character.get({ principal: original, characterId: first.characterId })).provenance).toBe("imported");
  expect(await run(OWNER_USER_ID, bytes, pluginId)).toEqual({ ...first, created: false });
});
