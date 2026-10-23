// @subject packages/server/src/domain/character/verbs/duplicate.ts
// @subject packages/server/src/domain/character/verbs/mint-synthetic-group-character.ts
// @subject packages/server/src/domain/character/persistence/card.ts
// @subject packages/server/src/domain/character/persistence/handoff-copy-write.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { characters } from "@orb/db";
import { seedCreatedCharacter } from "@orb/testkit/node/factories/character.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { handoffActors } from "../../chat/substrate/handoff.fixtures.ts";

test("same-owner duplication is born at the current injected instant, not the source edit or SQL time", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  const source = await seedCreatedCharacter(harness, {
    principal,
    input: createCharacterSchema.parse({ handle: "duplicate-clock", name: "Clock", description: "Original" }),
  });
  harness.clock.advance(12_345);
  await harness.services.character.update({ principal, characterId: source.row.id, input: { description: "Edited" } });
  const before = await harness.db.select().from(characters).where(eq(characters.id, source.row.id));
  harness.clock.advance(23_456);
  const at = harness.clock.now();
  const copy = await harness.services.character.duplicate({ principal, characterId: source.row.id });
  expect(await harness.db.select().from(characters).where(eq(characters.id, copy.id))).toMatchObject([
    { ownerId: principal.userId, description: "Edited", createdAt: at, updatedAt: at, importedFrom: null },
  ]);
  expect(copy.id).not.toBe(source.row.id);
  expect(await harness.db.select().from(characters).where(eq(characters.id, source.row.id))).toEqual(before);
});

test("group identity birth uses injected time and repeated or competing mints preserve the winner", async ({ harness }) => {
  const principal = await harness.principalFor((await harness.actor()).id);
  const room = await harness.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  harness.clock.advance(34_567);
  const at = harness.clock.now();
  const params = { ownerId: principal.userId, chatId: room.chat.id };
  const [first, competing] = await Promise.all([
    harness.services.character.mintSyntheticGroupCharacter(params),
    harness.services.character.mintSyntheticGroupCharacter(params),
  ]);
  expect(competing).toEqual(first);
  const before = await harness.db.select().from(characters).where(eq(characters.id, first.characterId));
  expect(before).toMatchObject([{ ownerId: principal.userId, synthetic: true, createdAt: at, updatedAt: at }]);
  harness.clock.advance(45_678);
  expect(await harness.services.character.mintSyntheticGroupCharacter(params)).toEqual(first);
  expect(await harness.db.select().from(characters).where(eq(characters.id, first.characterId))).toEqual(before);
});

test("accepted cross-owner handoff gives copied cards a fresh coherent birth without changing source stamps", async ({ harness }) => {
  const actors = await handoffActors(harness);
  const sourceRows = await harness.db.select().from(characters).where(eq(characters.ownerId, actors.host.userId)).orderBy(characters.id);
  harness.clock.advance(56_789);
  await harness.services.chat.nominateHostHandoff({
    principal: actors.host,
    chatId: actors.chat.id,
    userId: actors.nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  harness.clock.advance(67_890);
  const at = harness.clock.now();
  await harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id });
  const copies = await harness.db.select().from(characters).where(eq(characters.ownerId, actors.nominee.userId)).orderBy(characters.name);
  expect(copies).toHaveLength(actors.cards.length);
  for (const [index, copy] of copies.entries()) {
    const source = actors.cards[index];
    if (source === undefined) {
      throw new Error("the accepted offer created a card outside its source set");
    }
    expect(copy).toMatchObject({
      name: source.name,
      ownerId: actors.nominee.userId,
      importedFrom: `handoff:${actors.chat.id}:${source.id}`,
      createdAt: at,
      updatedAt: at,
      interactiveHtml: null,
      refinery: null,
    });
    expect(copy.id).not.toBe(source.id);
  }
  expect(await harness.db.select().from(characters).where(eq(characters.ownerId, actors.host.userId)).orderBy(characters.id)).toEqual(sourceRows);
  await harness.services.chat.nominateHostHandoff({ principal: actors.nominee, chatId: actors.chat.id, userId: actors.host.userId });
  await harness.services.chat.acceptHostHandoff({ principal: actors.host, chatId: actors.chat.id });
  for (const source of actors.cards) {
    await harness.services.chat.addCharacterToChat({ principal: actors.host, chatId: actors.chat.id, characterId: source.id });
  }
  harness.clock.advance(78_901);
  await harness.services.chat.nominateHostHandoff({
    principal: actors.host,
    chatId: actors.chat.id,
    userId: actors.nominee.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  await harness.services.chat.acceptHostHandoff({ principal: actors.nominee, chatId: actors.chat.id });
  expect(await harness.db.select().from(characters).where(eq(characters.ownerId, actors.nominee.userId)).orderBy(characters.name)).toEqual(copies);
});
