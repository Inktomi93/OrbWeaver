// @subject tests/support/node/factories/rows/world-info.ts
// @subject tests/support/node/factories/world-info-view.ts
// @subject tests/support/node/corpus-library-views.ts
import { createPersonaSchema } from "@orb/contracts/persona";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { isPlainObject } from "@orb/kit/guards";
import { seedPersonaLibraryViews, seedRegexLibraryViews, seedTagLibraryViews, seedWorldInfoLibraryViews } from "../corpus-library-views.ts";
import { seedCorpusLibraries } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedBackfilledWorldTitles } from "./rows/world-info.ts";
import { makeWorldInfoImportResult } from "./world-info-view.ts";

test("world book import defaults admit a native named book and title repair captures only its changed children", async () => {
  const defaults = makeWorldInfoImportResult();
  const input = createBookSchema.parse({ name: defaults.name });
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const bornAt = root.clock.now();
  const foreign = await root.actor();
  const other = await root.internalCallerFor(foreign.id);
  const foreignBook = await other.worldInfo.createBook({ input });
  await other.worldInfo.createEntry({
    bookId: foreignBook.id,
    input: createEntrySchema.parse({ title: "Keyed", content: "The keyed witness survives repair.", keys: ["archive", "witness"], priority: 4 }),
  });
  await other.worldInfo.createEntry({
    bookId: foreignBook.id,
    input: createEntrySchema.parse({
      title: "Unkeyed",
      content: "The unkeyed witness stays unnamed.",
      keys: [],
      enabled: false,
      priority: 2,
      ignoreBudget: true,
    }),
  });
  const exported = await other.worldInfo.exportBook({ bookId: foreignBook.id });
  const restored: unknown = JSON.parse(exported.fileText);
  if (!(isPlainObject(restored) && Array.isArray(restored["entries"]))) {
    throw new Error("native export omitted its entries");
  }
  for (const entry of restored["entries"]) {
    if (!isPlainObject(entry)) {
      throw new Error("native export emitted a non-object entry");
    }
    Reflect.set(entry, "title", "");
  }
  expect(await caller.worldInfo.importFile({ fileText: JSON.stringify(restored) })).toEqual(defaults);
  const book = (await caller.worldInfo.listBooks()).find((row) => row.name === input.name);
  if (book === undefined) {
    throw new Error("native import omitted its named book");
  }
  const before = await caller.worldInfo.listEntries({ bookId: book.id });
  const foreignBefore = await other.worldInfo.listEntries({ bookId: foreignBook.id });
  root.clock.advance(2000);
  const captured = await seedBackfilledWorldTitles(root, { principal, bookId: book.id });
  expect(captured.result).toEqual({ filled: 1 });
  expect(captured.entries.map((row) => [row.id, row.worldBookId, row.title, row.content, row.updatedAt])).toEqual([
    [before[0]?.id, book.id, "archive, witness", "The keyed witness survives repair.", root.clock.now()],
    [before[1]?.id, book.id, "", "The unkeyed witness stays unnamed.", bornAt],
  ]);
  expect((await caller.worldInfo.listEntries({ bookId: book.id })).map((row) => row.title)).toEqual(["archive, witness", ""]);
  expect(await other.worldInfo.listEntries({ bookId: foreignBook.id })).toEqual(foreignBefore);
  expect((await seedBackfilledWorldTitles(root, { principal, bookId: book.id })).result).toEqual({ filled: 0 });
  await expect(seedBackfilledWorldTitles(root, { principal, bookId: foreignBook.id })).rejects.toThrow();
});

test("world library outputs preserve attachment roles, entry ordering, portable collisions and owner boundaries", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const actor = await root.actor();
  const other = await root.internalCallerFor(actor.id);
  await caller.persona.setActivePersona({ chatId: library.room.chat.id, personaId: library.persona.id });
  const views = await seedWorldInfoLibraryViews(root, library, caller, other);
  expect(views.detail.output).toEqual({ id: library.world.book.id, name: library.world.book.name, description: null, createdAt: root.clock.now() });
  expect(views.usage.output.find((book) => book.id === library.world.book.id)).toMatchObject({
    entryCount: 1,
    usage: { characters: 1, personas: 1, chats: 1, global: true, total: 4 },
  });
  expect(views.targets.output).toEqual({ characters: [{ characterId: library.character.id, role: "primary" }], personaIds: [library.persona.id] });
  expect(views.ordered.output).toEqual({ reordered: 2 });
  expect(views.orderedEntries.output.map((entry) => [entry.id, entry.worldBookId, entry.priority])).toEqual([
    [views.second.id, views.book.id, 2],
    [views.first.id, views.book.id, 1],
  ]);
  expect(views.entry.output).toMatchObject({ id: views.first.id, worldBookId: views.book.id, content: views.first.content, keys: ["archive"] });
  expect(views.demoted.output.find((book) => book.id === views.book.id)?.role).toBe("auxiliary");
  expect(views.demoted.output.find((book) => book.id === views.replacement.id)?.role).toBe("primary");
  expect(views.characterBooks.output).toMatchObject([{ id: library.world.book.id, role: "primary" }]);
  expect(views.personaBooks.output).toMatchObject([{ id: library.world.book.id, role: null }]);
  expect(views.globalBooks.output).toMatchObject([{ id: library.world.book.id, role: null }]);
  expect(views.chatBooks.output).toMatchObject([{ id: library.world.book.id, role: null }]);
  expect(views.inheritedBooks.output).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: library.world.book.id, inherited: { source: "global", name: null } }),
      expect.objectContaining({ id: library.world.book.id, inherited: { source: "character", name: library.character.name } }),
      expect.objectContaining({ id: library.world.book.id, inherited: { source: "persona", name: library.persona.name } }),
    ]),
  );
  expect(views.imported.output).toMatchObject({ created: true, renamedFrom: views.book.name });
  expect(views.imported.output.name).not.toBe(views.collision.name);
  expect(views.repeated.output).toMatchObject({ created: false, name: views.imported.output.name });
  expect(views.exported.output.filename).toMatch(/\.json$/u);
  expect(views.deleted.output).toEqual({ deleted: true });
  await expect(caller.worldInfo.getBook(views.deleted.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(views.books.output.map((book) => book.id)).not.toContain(views.collision.id);
  expect(await caller.worldInfo.countBooks()).toBe(views.books.output.length);
  await expect(other.worldInfo.listAttachmentsForBook(views.targets.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(other.worldInfo.detachGlobal({ bookId: library.world.book.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await caller.worldInfo.detachGlobal({ bookId: library.world.book.id })).toEqual({ detached: true });
  expect((await caller.worldInfo.listGlobal()).map((book) => book.id)).not.toContain(library.world.book.id);
  expect(await caller.worldInfo.detachGlobal({ bookId: library.world.book.id })).toEqual({ detached: false });
  expect(await caller.worldInfo.removeEntry({ entryId: views.first.id })).toEqual({ deleted: true });
  await expect(caller.worldInfo.getEntry({ entryId: views.first.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("regex output captures preserve execution order, host opt-in, portable reuse and scoped bulk outcomes", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const actor = await root.actor();
  const other = await root.internalCallerFor(actor.id);
  const views = await seedRegexLibraryViews(root, library, caller, other);
  expect(views.after.output.map((script) => script.id)).toEqual([views.second.id, views.first.id]);
  expect(views.ordered.output).toEqual({ reordered: 2 });
  expect(views.displayOff.output).toEqual([]);
  expect(views.displayOn.output).toEqual(expect.arrayContaining([...views.after.output]));
  expect(views.list.output.find((script) => script.id === views.first.id)).toMatchObject({
    enabled: true,
    placement: ["DISPLAY"],
    markdownOnly: true,
    promptOnly: false,
    updatedAt: root.clock.now(),
  });
  expect(views.global.output.map((script) => script.id)).toContain(views.first.id);
  expect(views.character.output.map((script) => script.id)).toContain(views.first.id);
  expect(views.preset.output.map((script) => script.id)).toContain(views.first.id);
  expect(views.usage.output.presets).toContainEqual({ id: library.preset.id, name: library.preset.name });
  expect(views.usage.output.characters).toContainEqual({ id: library.character.id, name: library.character.name });
  expect(views.usage.output.rooms.map((room) => room.id)).toContain(library.room.chat.id);
  expect(views.imported.output).toEqual({ created: true });
  expect(views.repeated.output).toEqual({ created: false });
  expect(views.bulk.output).toEqual({ affected: 1 });
  expect(views.detached.output).toEqual({ detached: true });
  expect(views.detachedAgain.output).toEqual({ detached: false });
  expect(views.deleted.output).toEqual({ deleted: true });
  expect(views.list.output.map((script) => script.id)).not.toContain(views.deleted.input.scriptId);
  const foreign = (await other.regex.listScripts()).find((script) => script.name === views.first.name);
  if (foreign === undefined) {
    throw new Error("native import omitted its foreign script");
  }
  expect(views.list.output.map((script) => script.id)).not.toContain(foreign.id);
  expect(await caller.regex.countScripts()).toBe(views.list.output.length);
  root.clock.advance(2000);
  expect(await caller.regex.bulkSetEnabled({ scriptIds: [views.first.id, foreign.id], enabled: false })).toEqual({ affected: 1 });
  const disabled = (await caller.regex.listScripts()).find((script) => script.id === views.first.id);
  expect(disabled).toMatchObject({ enabled: false, updatedAt: root.clock.now() });
  expect((await other.regex.listScripts()).find((script) => script.id === foreign.id)).toEqual(foreign);
  root.clock.advance(2000);
  expect(await caller.regex.bulkSetEnabled({ scriptIds: [views.first.id, foreign.id], enabled: false })).toEqual({ affected: 0 });
  expect((await caller.regex.listScripts()).find((script) => script.id === views.first.id)).toEqual(disabled);
  expect((await other.regex.listScripts()).find((script) => script.id === foreign.id)).toEqual(foreign);
  await expect(other.regex.listScriptUsage(views.usage.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("tag and persona captures preserve adopted versus pending reach and default replacement identities", async () => {
  await using root = await createServerHarness();
  const library = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const actor = await root.actor();
  const other = await root.internalCallerFor(actor.id);
  const tags = await seedTagLibraryViews(root, library, caller);
  expect(tags.pending.output.find((tag) => tag.id === tags.tag.id)).toMatchObject({
    characterId: library.character.id,
    characterName: library.character.name,
    name: tags.tag.name,
  });
  expect(tags.before.output.find((tag) => tag.id === tags.tag.id)).toMatchObject({
    usage: { characters: 0, chats: 1, worldBooks: 1, personas: 1, presets: 1, total: 4 },
    pendingSuggestions: 1,
  });
  expect(tags.usage.output.find((tag) => tag.id === tags.tag.id)).toMatchObject({
    usage: { characters: 1, chats: 1, worldBooks: 1, personas: 1, presets: 1, total: 5 },
    pendingSuggestions: 0,
  });
  expect(tags.vocabulary.output.find((tag) => tag.id === tags.tag.id)).toEqual({ id: tags.tag.id, name: tags.tag.name, isHiddenOnCard: false, characters: 1 });
  expect(tags.pendingAfter.output.map((tag) => tag.id)).not.toContain(tags.tag.id);
  expect(tags.reaches.map((capture) => capture.output)).toEqual([
    { entities: [{ targetType: "character", targetId: library.character.id, name: library.character.name }], hasMore: false },
    { entities: [{ targetType: "chat", targetId: library.room.chat.id, name: expect.any(String) }], hasMore: false },
    { entities: [{ targetType: "worldBook", targetId: library.world.book.id, name: library.world.book.name }], hasMore: false },
    { entities: [{ targetType: "persona", targetId: library.persona.id, name: library.persona.name }], hasMore: false },
    { entities: [{ targetType: "preset", targetId: library.preset.id, name: library.preset.name }], hasMore: false },
  ]);
  await expect(other.tag.listAttachedEntities({ tagId: tags.tag.id, targetType: "character" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const personas = await seedPersonaLibraryViews(library, caller, other);
  expect(personas.characters.output).toContainEqual({ id: library.character.id, name: library.character.name });
  expect(personas.connected.output.map((persona) => persona.id)).toContain(library.persona.id);
  expect(personas.imported.output.id).not.toBe(personas.duplicate.output.id);
  expect(personas.imported.output.description).toBe(library.persona.description);
  expect(personas.repeated.output.id).toBe(personas.imported.output.id);
  expect(personas.deleted.output).toEqual({ deleted: true, newDefaultPersonaId: null });
  expect(personas.disconnected.output).toEqual({ disconnected: false });
  const relation = { characterId: library.character.id, personaId: library.persona.id };
  expect(await caller.persona.disconnectFromCharacter(relation)).toEqual({ disconnected: true });
  expect(await caller.persona.listConnectedCharacters({ personaId: library.persona.id })).toEqual([]);
  expect(await caller.persona.disconnectFromCharacter(relation)).toEqual({ disconnected: false });
  const replacementTarget = await caller.persona.create({
    input: createPersonaSchema.parse({ name: "Temporary default", description: "Must fall back to its surviving current persona." }),
  });
  await caller.settings.updateUserSettingsSection({
    section: "seeds",
    patch: { defaultPersonaId: replacementTarget.id, currentPersonaId: library.persona.id },
  });
  expect(await caller.persona.remove({ personaId: replacementTarget.id })).toEqual({ deleted: true, newDefaultPersonaId: library.persona.id });
  expect((await caller.settings.getUserSettings()).config.seeds.defaultPersonaId).toBe(library.persona.id);
  await expect(other.persona.listConnectedCharacters({ personaId: library.persona.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
