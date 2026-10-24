// @subject packages/server/src/domain/import/verbs/portable-imports.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// The owner binders drive the genuine services and database; foreign arguments cannot replace the authenticated authority.
import { createCharacterSchema } from "@orb/contracts/character";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createInstallerCharacterImport } from "@orb/server/domain/import";
import { expect, test } from "@orb/testkit/node";
import { isOwner } from "@orb/testkit/node/auth";
import { vi } from "vitest";

test("owner binders retain Principal identity and ignore foreign owner arguments through real character/tag writes", async ({
  services,
  ownerCaller,
  harness,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const actor = await harness.principalFor(harness.ownerId);
  const foreignOwner = (await harness.actor()).id;
  const created = vi.spyOn(services.character, "create");
  const ctx = harness.app.crossFeatureOps.importContextFor(actor);
  const input = createCharacterSchema.parse({ handle: "authority-control", name: "Authority control", description: "Owned card" });
  const ref = await ctx.createCharacter({ ownerId: foreignOwner, input, importedFrom: "authority.json", importHash: "authority-hash" });
  expect(created.mock.calls[0]?.[0].principal).toBe(actor);
  expect(await services.character.get({ principal: actor, characterId: ref.characterId })).toMatchObject({ id: ref.characterId });
  expect(await ctx.findByImportHash({ ownerId: foreignOwner, importHash: "authority-hash" })).toBe(ref.characterId);
  expect(await ctx.findByHandle({ ownerId: foreignOwner, handle: input.handle })).toBe(ref.characterId);
  expect(await ctx.findByName({ ownerId: foreignOwner, name: input.name })).toEqual([ref.characterId]);
  await ctx.attachCardTag({ ownerId: foreignOwner, characterId: ref.characterId, tagName: "author-tag" });
  const [attachment] = (await services.character.get({ principal: actor, characterId: ref.characterId })).tags;
  expect(attachment).toMatchObject({ name: "author-tag", source: "card" });
  if (attachment === undefined) {
    throw new Error("the real attach did not create its junction");
  }
  expect(await services.tag.listAttachedEntities({ principal: actor, tagId: attachment.id, targetType: "character" })).toEqual({
    entities: [{ targetType: "character", targetId: ref.characterId, name: input.name }],
    hasMore: false,
  });
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
  expect(await descriptor.importFile(harness.ownerId, { filename: "malformed.json", bytes: new TextEncoder().encode("not a card") })).toMatchObject({
    ok: false,
  });
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
  const bytes = new TextEncoder().encode(
    '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Parser control","description":"Owned card","first_mes":"Hello"}}',
  );
  expect(await descriptor.importFile(harness.ownerId, { filename: "control.json", bytes })).toMatchObject({ ok: true, created: true });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]?.[0].principal.userId).toBe(harness.ownerId);
  expect(await services.character.count({ principal: await harness.principalFor(harness.ownerId) })).toBe(1);
});

test("the installer factory uses the row-resolved role and the real import funnel for provenance and byte-identical reingest", async ({
  harness,
  services,
  ownerCaller,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const resolvePrincipal = vi.fn(harness.principalFor);
  const create = vi.spyOn(services.character, "create");
  const run = createInstallerCharacterImport({
    resolvePrincipal,
    contextFor: harness.app.crossFeatureOps.importContextFor,
  });
  const pluginId = mintTypeId(ID_PREFIX.plugin);
  const bytes = new TextEncoder().encode(
    '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Installer role control","description":"Owned imported card","first_mes":"Hello"}}',
  );
  const first = await run(harness.ownerId, bytes, pluginId);
  const original = await resolvePrincipal.mock.results[0]?.value;
  expect(create.mock.calls[0]?.[0].principal).toBe(original);
  expect(first.created).toBe(true);
  if (original === undefined) {
    throw new Error("the real row resolver was not called");
  }
  expect(isOwner(original)).toBe(true);
  expect((await services.character.get({ principal: original, characterId: first.characterId })).provenance).toBe("imported");
  expect(await run(harness.ownerId, bytes, pluginId)).toEqual({ ...first, created: false });
});
