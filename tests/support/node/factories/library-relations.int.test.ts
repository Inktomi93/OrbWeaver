// @subject tests/support/node/corpus-seed.ts
// @subject tests/support/node/factories/tag.ts
// @subject tests/support/node/factories/world-info.ts
// @subject tests/support/node/factories/databank.ts
// @subject tests/support/node/factories/character.ts
// @subject tests/support/node/factories/gallery.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { createTagSchema } from "@orb/contracts/tag";
import { createBookSchema } from "@orb/contracts/world-info";
import { characterBooks, characterTags, chatTags } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { createCorpusReadResponder } from "@orb/testkit/browser/corpus-read-responder.ts";
import { captureCorpusReads, seedCorpusLibraries } from "@orb/testkit/node/corpus-seed.ts";
import { seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/factories/chat.ts";
import { seedGalleryItem } from "@orb/testkit/node/factories/gallery.ts";
import { seedCharacterTag, seedChatTag, seedTag } from "@orb/testkit/node/factories/tag.ts";
import { seedCharacterBook, seedWorldBook } from "@orb/testkit/node/factories/world-info.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

test("shared library producers preserve every real relation and pending acceptance plus primary-book demotion", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const principal = await root.principalFor(root.ownerId);
  expect(library.snapshot.characterId).toBe(library.character.id);
  expect(library.characterPersona).toMatchObject({ characterId: library.character.id, personaId: library.persona.id });
  expect(library.gallery).toMatchObject({ assetId: library.asset.assetId, subjectCharacterId: library.character.id });
  expect(
    await seedGalleryItem(root.db, root.app.assets.addToGallery, { principal, assetId: library.asset.assetId, subjectCharacterId: library.character.id }),
  ).toEqual(library.gallery);
  expect(library.world.entries.map((row) => row.worldBookId)).toEqual([library.world.book.id]);
  expect(library.world.character).toMatchObject([{ characterId: library.character.id, worldBookId: library.world.book.id, role: "primary" }]);
  expect(library.world.chat).toMatchObject([{ chatId: library.room.chat.id, worldBookId: library.world.book.id }]);
  expect(library.world.persona).toMatchObject([{ personaId: library.persona.id, worldBookId: library.world.book.id }]);
  expect(library.world.global).toMatchObject([{ worldBookId: library.world.book.id }]);
  expect(library.documents.character).toMatchObject({ characterId: library.character.id, documentId: library.document.id });
  expect(library.documents.chat).toMatchObject({ chatId: library.room.chat.id, documentId: library.document.id });
  expect(library.documents.global).toMatchObject({ ownerId: root.ownerId, documentId: library.document.id });
  expect(library.tags.character).toMatchObject({ characterId: library.character.id, tagId: library.tag.id, status: "pending" });
  expect(library.tags.chat).toMatchObject({ ownerId: root.ownerId, chatId: library.room.chat.id, tagId: library.tag.id });
  expect(library.tags.persona).toMatchObject({ personaId: library.persona.id, tagId: library.tag.id });
  expect(library.tags.preset).toMatchObject({ presetId: library.preset.id, tagId: library.tag.id });
  expect(library.tags.world).toMatchObject({ worldBookId: library.world.book.id, tagId: library.tag.id });
  const reads = await captureCorpusReads(root, {
    soloChatId: library.room.chat.id,
    groupChatId: library.room.chat.id,
    documentId: library.document.id,
    personaIds: [library.persona.id],
  });
  const persona = createCorpusReadResponder("persona.get", reads["persona.get"]);
  expect(persona({ personaId: library.persona.id })).toEqual(library.persona);
  expect(reads["tag.listPendingSuggestions"].flatMap((capture) => capture.output.map((tag) => tag.id))).toContain(library.tag.id);
  const accepted = await seedCharacterTag(root.db, root.services.tag.attachTag, { principal, characterId: library.character.id, tagId: library.tag.id });
  expect(accepted.status).toBe("accepted");
  const replacement = await seedWorldBook(root.db, root.services.worldInfo.createBook, {
    principal,
    input: createBookSchema.parse({ name: "The new primary ledger" }),
  });
  await seedCharacterBook(root.db, root.services.worldInfo.attachToCharacter, {
    principal,
    characterId: library.character.id,
    bookId: replacement.id,
    role: "primary",
  });
  const books = await root.db.select().from(characterBooks).where(eq(characterBooks.characterId, library.character.id));
  expect(books.filter((row) => row.role === "primary").map((row) => row.worldBookId)).toEqual([replacement.id]);
  expect(books.find((row) => row.worldBookId === library.world.book.id)?.role).toBe("auxiliary");
});

test("real chat taggers retain separate overlays and foreign relation targets refuse before writes", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const principal = await root.principalFor(root.ownerId);
  const actor = await root.actor();
  const member = await root.principalFor(actor.id);
  const invitation = await seedChatInvite(root.db, root.services.chat.createInvite, {
    principal,
    chatId: library.room.chat.id,
    input: { invitedHandle: actor.handle },
  });
  await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invitation.id });
  const memberTag = await seedTag(root.db, root.services.tag.createTag, { principal: member, input: createTagSchema.parse({ name: "Member ledger label" }) });
  const memberOverlay = await seedChatTag(root.db, root.services.tag.attachTag, { principal: member, chatId: library.room.chat.id, tagId: memberTag.id });
  expect(memberOverlay.ownerId).toBe(actor.id);
  const overlays = await root.db.select().from(chatTags).where(eq(chatTags.chatId, library.room.chat.id));
  expect(overlays.map((row) => [row.ownerId, row.tagId])).toEqual(
    expect.arrayContaining([
      [root.ownerId, library.tag.id],
      [actor.id, memberTag.id],
    ]),
  );
  expect(overlays).toHaveLength(2);
  const foreignCharacter = await root.services.character.create({
    principal: member,
    input: createCharacterSchema.parse({
      handle: "member-ledger",
      name: "The member's archivist",
      description: "An archivist owned only by the invited member.",
    }),
  });
  const booksBefore = await root.db.select().from(characterBooks);
  const tagsBefore = await root.db.select().from(characterTags);
  await expect(
    seedCharacterBook(root.db, root.services.worldInfo.attachToCharacter, {
      principal,
      characterId: foreignCharacter.id,
      bookId: library.world.book.id,
      role: "primary",
    }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(
    seedCharacterTag(root.db, root.services.tag.attachTag, { principal, characterId: foreignCharacter.id, tagId: library.tag.id }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await root.db.select().from(characterBooks)).toEqual(booksBefore);
  expect(await root.db.select().from(characterTags)).toEqual(tagsBefore);
});
