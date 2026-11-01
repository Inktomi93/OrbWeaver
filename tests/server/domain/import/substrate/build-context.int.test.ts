// @subject packages/server/src/domain/import/verbs/portable-imports.ts
// @subject packages/server/src/domain/import/verbs/import-character.ts
// The owner binders drive the genuine services and database under the authenticated owner.
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";

test("an imported card's tag is written under the authenticated owner through the real character and tag writes", async ({
  services,
  ownerCaller,
  harness,
}): Promise<void> => {
  await ownerCaller.character.list({});
  const actor = await harness.principalFor(harness.ownerId);
  const descriptor = harness.app.portability.find((entity) => entity.kind === "character");
  if (descriptor === undefined) {
    throw new Error("the real graph omitted its character import operation");
  }
  const created = vi.spyOn(services.character, "create");
  const bytes = new TextEncoder().encode(
    '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Authority control","description":"Owned card","first_mes":"Hello","tags":["author-tag"]}}',
  );
  const outcome = await descriptor.importFile(harness.ownerId, { filename: "authority.json", bytes });
  expect(outcome).toMatchObject({ ok: true, created: true });
  expect(created.mock.calls[0]?.[0].principal.userId).toBe(actor.userId);
  const [listed] = (await services.character.list({ principal: actor })).items;
  if (listed === undefined) {
    throw new Error("the import created no character");
  }
  const [attachment] = (await services.character.get({ principal: actor, characterId: listed.id })).tags;
  expect(attachment).toMatchObject({ name: "author-tag", source: "card" });
  if (attachment === undefined) {
    throw new Error("the real attach did not create its junction");
  }
  expect(await services.tag.listAttachedEntities({ principal: actor, tagId: attachment.id, targetType: "character" })).toEqual({
    entities: [{ targetType: "character", targetId: listed.id, name: "Authority control" }],
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
