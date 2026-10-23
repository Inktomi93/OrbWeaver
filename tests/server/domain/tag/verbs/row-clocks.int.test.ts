// @subject packages/server/src/domain/tag/verbs/create.ts
// @subject packages/server/src/domain/tag/verbs/import.ts
// @subject packages/server/src/domain/tag/verbs/attach.ts
// @subject packages/server/src/domain/tag/verbs/attach-card-tag-by-name.ts
// @subject packages/server/src/domain/tag/verbs/attach-chat-tag-by-name.ts
// @subject packages/server/src/domain/tag/persistence/junctions.ts
// @subject packages/server/src/domain/tag/persistence/queries.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { PortableFile } from "@orb/contracts/portability";
import { createBookSchema } from "@orb/contracts/world-info";
import { characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import { DomainConflictError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { seedCreatedCharacter, seedCreatedTag } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

test("tag creation uses advanced product time and a folded-name conflict preserves the existing birth", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  harness.clock.advance(12_345);
  const at = harness.clock.now();
  const created = await seedCreatedTag(harness, { principal, input: { name: "Clock witness" } });
  expect(created.row.createdAt).toBe(at);
  harness.clock.advance(5000);
  await expect(harness.services.tag.createTag({ principal, input: { name: "CLOCK WITNESS" } })).rejects.toBeInstanceOf(DomainConflictError);
  expect(await harness.db.select().from(tags).where(eq(tags.id, created.row.id))).toEqual([created.row]);
});

test("native tag-library restore stamps new rows but preserves existing births and attachments", async ({ harness }) => {
  const source = await harness.principalFor((await harness.actor()).id);
  const principal = await harness.principalFor((await harness.actor()).id);
  await harness.services.tag.createTag({ principal: source, input: { name: "Restore existing", color: "#123456" } });
  await harness.services.tag.createTag({ principal: source, input: { name: "Restore new" } });
  const existing = await seedCreatedTag(harness, { principal, input: { name: "Restore existing" } });
  const character = await seedCreatedCharacter(harness, {
    principal,
    input: createCharacterSchema.parse({ handle: "restore-witness", name: "Restore witness", description: "" }),
  });
  await harness.services.tag.attachTag({ principal, tagId: existing.row.id, targetType: "character", targetId: character.row.id });
  const before = await harness.db.select().from(characterTags).where(eq(characterTags.tagId, existing.row.id));
  const descriptor = harness.app.portability.find((entity) => entity.kind === "tag");
  if (descriptor === undefined) {
    throw new Error("the production portability registry omitted tag libraries");
  }
  const files: PortableFile[] = [];
  for await (const file of descriptor.exportAll(source.userId)) {
    files.push(file);
  }
  expect(files).toHaveLength(1);
  const file = files[0];
  if (file === undefined) {
    throw new Error("the actual tag library export produced no file");
  }
  harness.clock.advance(23_456);
  const at = harness.clock.now();
  expect(await descriptor.importFile(principal.userId, file)).toMatchObject({ ok: true });
  const restored = await harness.db.select().from(tags).where(eq(tags.ownerId, principal.userId)).orderBy(tags.name);
  expect(restored).toMatchObject([
    { id: existing.row.id, name: "Restore existing", color: "#123456", createdAt: existing.row.createdAt },
    { name: "Restore new", createdAt: at },
  ]);
  expect(restored).toHaveLength(2);
  expect(await harness.db.select().from(characterTags).where(eq(characterTags.tagId, existing.row.id))).toEqual(before);
  harness.clock.advance(34_567);
  expect(await descriptor.importFile(principal.userId, file)).toMatchObject({ ok: true });
  expect(await harness.db.select().from(tags).where(eq(tags.ownerId, principal.userId)).orderBy(tags.name)).toEqual(restored);
});

test("all five native junction arms stamp single and bulk births without rewriting conflicts", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "junction-clock", name: "Clock", description: "" }),
  });
  const chat = await harness.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const persona = await harness.services.persona.create({ principal, input: createPersonaSchema.parse({ name: "Clock", description: "" }) });
  const book = await harness.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Clock", description: "" }) });
  const caller = await harness.internalCallerFor(principal.userId);
  const preset = await caller.preset.create({ name: "Clock", kind: "custom" });
  const single = await harness.services.tag.createTag({ principal, input: { name: "Single" } });
  const bulk = await harness.services.tag.createTag({ principal, input: { name: "Bulk" } });
  const targets = [
    {
      targetType: "character",
      targetId: character.id,
      read: () => harness.db.select().from(characterTags).where(eq(characterTags.characterId, character.id)).orderBy(characterTags.tagId),
    },
    {
      targetType: "chat",
      targetId: chat.chat.id,
      read: () => harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.chat.id)).orderBy(chatTags.tagId),
    },
    {
      targetType: "persona",
      targetId: persona.id,
      read: () => harness.db.select().from(personaTags).where(eq(personaTags.personaId, persona.id)).orderBy(personaTags.tagId),
    },
    {
      targetType: "worldBook",
      targetId: book.id,
      read: () => harness.db.select().from(worldBookTags).where(eq(worldBookTags.worldBookId, book.id)).orderBy(worldBookTags.tagId),
    },
    {
      targetType: "preset",
      targetId: preset.id,
      read: () => harness.db.select().from(presetTags).where(eq(presetTags.presetId, preset.id)).orderBy(presetTags.tagId),
    },
  ] as const;
  harness.clock.advance(45_678);
  const singleAt = harness.clock.now();
  for (const target of targets) {
    await harness.services.tag.attachTag({ principal, tagId: single.id, ...target, status: "pending" });
    expect(await target.read()).toMatchObject([{ tagId: single.id, createdAt: singleAt }]);
  }
  harness.clock.advance(56_789);
  const bulkAt = harness.clock.now();
  for (const target of targets) {
    await harness.services.tag.bulkAttachTag({ principal, tagIds: [single.id, bulk.id], ...target });
    expect(await target.read()).toMatchObject([
      { tagId: single.id, createdAt: singleAt },
      { tagId: bulk.id, createdAt: bulkAt },
    ]);
  }
  expect(await targets[0].read()).toMatchObject([{ status: "accepted" }, { status: "accepted" }]);
  harness.clock.advance(67_890);
  for (const target of targets) {
    const before = await target.read();
    await harness.services.tag.attachTag({ principal, tagId: single.id, ...target });
    expect(await target.read()).toEqual(before);
  }
  await harness.services.tag.mergeTags({ principal, sourceTagId: bulk.id, targetTagId: single.id });
  for (const target of targets) {
    expect(await target.read()).toMatchObject([{ tagId: single.id, createdAt: singleAt }]);
    expect(await target.read()).toHaveLength(1);
    await harness.services.tag.detachTag({ principal, tagId: single.id, ...target });
    expect(await target.read()).toEqual([]);
  }
});

test("by-name card and chat imports share one birth instant and retain the original rows on replay", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  const character = await harness.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "by-name-clock", name: "Clock", description: "" }),
  });
  const chat = await harness.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  harness.clock.advance(78_901);
  const at = harness.clock.now();
  await harness.services.character.bulkAddCardTag({ principal, characterIds: [character.id], tagName: "Card birth" });
  await harness.services.tag.attachChatTagByName({ ownerId: principal.userId, chatId: chat.chat.id, tagName: "Chat birth" });
  const before = {
    tags: await harness.db.select().from(tags).where(eq(tags.ownerId, principal.userId)).orderBy(tags.id),
    character: await harness.db.select().from(characterTags).where(eq(characterTags.characterId, character.id)),
    chat: await harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.chat.id)),
  };
  expect(before.tags.map((row) => row.createdAt)).toEqual([at, at]);
  expect(before.character).toMatchObject([{ createdAt: at, status: "accepted" }]);
  expect(before.chat).toMatchObject([{ createdAt: at, ownerId: principal.userId }]);
  harness.clock.advance(89_012);
  await harness.services.character.bulkAddCardTag({ principal, characterIds: [character.id], tagName: "CARD BIRTH" });
  await harness.services.tag.attachChatTagByName({ ownerId: principal.userId, chatId: chat.chat.id, tagName: "CHAT BIRTH" });
  expect(await harness.db.select().from(tags).where(eq(tags.ownerId, principal.userId)).orderBy(tags.id)).toEqual(before.tags);
  expect(await harness.db.select().from(characterTags).where(eq(characterTags.characterId, character.id))).toEqual(before.character);
  expect(await harness.db.select().from(chatTags).where(eq(chatTags.chatId, chat.chat.id))).toEqual(before.chat);
});
