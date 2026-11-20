// A stored lore entry's metadata reads back as stored: a key this release does not declare (a preserved ST field)
// rides through as JSON however deep, an absent known field stays absent, and a known field out of shape heals the
// blob to null. Stored text that is not JSON reads as null, and the machine writer leaves that entry alone. The library
// export carries the entry without it and names it in the export report; the book door and the card route, which have
// nothing else to deliver, refuse naming the entry until the entry editor's save rewrites its metadata.
// @subject packages/contracts/src/world-info/schemas.ts
// @subject packages/server/src/domain/world-info/persistence/queries.ts
// @subject packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts
// @subject packages/server/src/domain/world-info/verbs/export.ts
// @subject packages/server/src/domain/export/verbs/export-character.ts
// @subject packages/server/src/entry/http/export.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { PortableExportNote } from "@orb/contracts/portability";
import { exportCharacterPath, PORTABLE_DIRECTORIES, PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { worldEntries } from "@orb/db";
import { slugifyHandle } from "@orb/kit/slug";
import { expect, test } from "@orb/testkit/node";
import { readLibraryExport, signedInBox } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Deeper than a recursive member check survives inside the read seam.
const DEPTH = 2500;
const DEEP = `${"[".repeat(DEPTH)}1${"]".repeat(DEPTH)}`;

test("a stored lore entry's metadata reads back as stored, undeclared keys and absent fields included", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: "Atlas" } });
  const entry = await caller.worldInfo.createEntry({ bookId: book.id, input: { title: "Harbor", content: "The harbor floods at dusk." } });
  const read = async (stored: string): Promise<string> => {
    await harness.db
      .update(worldEntries)
      .set({ metadata: sql`${stored}` })
      .where(eq(worldEntries.id, entry.id));
    return JSON.stringify((await caller.worldInfo.getEntry({ entryId: entry.id })).metadata);
  };

  const undeclared = `{"scopeMode":"always","selectiveLogic":0,"vendor":{"note":"kept","deep":${DEEP}}}`;
  expect(await read(undeclared)).toBe(undeclared);
  const knownAbsent = '{"position":"after"}';
  expect(await read(knownAbsent)).toBe(knownAbsent);
  expect(await read('{"scopeMode":"sometimes","vendor":1}')).toBe("null");
});

const BOOK = "Atlas";
const ENTRY = "Harbor";
const CHARACTER = "Harbor Keeper";
const CONFLICT = 409;
const OK = 200;

const unreadable = (kind: PortableExportNote["kind"], item: string): PortableExportNote => ({
  kind,
  item,
  code: STORED_CONFIG_UNREADABLE,
  failure: VERSIONED_PARSE_FAILURES.notJson,
  carried: PORTABLE_EXPORT_CARRY.withoutMetadata,
});

test("lore entry metadata holding text that is not JSON is carried without it and named by the library export, and refuses the book and card doors until the editor saves it", async () => {
  const notJson = '{"scopeMode": "alw';
  await using box = await signedInBox();
  const principal = await box.principalFor(box.ownerId);
  const caller = await box.internalCallerFor(box.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: BOOK } });
  await box.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: ENTRY, keys: ["harbor"], content: "It floods at dusk." }] });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "harbor-keeper", name: CHARACTER, description: "Keeps the light." }),
  });
  await caller.worldInfo.attachToCharacter({ characterId: character.id, bookId: book.id, role: "primary" });
  const [entry] = await box.db.select({ id: worldEntries.id }).from(worldEntries).where(eq(worldEntries.worldBookId, book.id));
  if (entry === undefined) {
    throw new Error("the machine writer did not insert its entry");
  }
  const card = async (): Promise<{ readonly status: number; readonly body: unknown }> => {
    const response = await box.http.request(`${exportCharacterPath(character.id)}?format=json`);
    return { status: response.status, body: response.status === OK ? null : await response.json() };
  };
  // Positive control: the readable entry exports through every door and the library reports nothing.
  expect((await readLibraryExport(box, ["world-info", "character"])).report).toBeNull();
  expect(await box.services.worldInfo.exportBook({ principal, bookId: book.id })).not.toBeNull();
  expect(await card()).toEqual({ status: OK, body: null });

  await box.db
    .update(worldEntries)
    .set({ metadata: sql`${notJson}` })
    .where(eq(worldEntries.id, entry.id));
  const stored = async (): Promise<unknown> =>
    await box.db
      .select({ text: sql<string>`${worldEntries.metadata}`, content: worldEntries.content })
      .from(worldEntries)
      .where(eq(worldEntries.id, entry.id));

  expect((await caller.worldInfo.getEntry({ entryId: entry.id })).metadata).toBeNull();
  await box.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: ENTRY, keys: ["harbor"], content: "It never floods." }] });
  expect(await stored()).toEqual([{ text: notJson, content: "It floods at dusk." }]);

  const library = await readLibraryExport(box, ["world-info", "character"]);
  expect(library.report).toEqual({ notes: [unreadable("world-info", `${BOOK}: ${ENTRY}`), unreadable("character", `${CHARACTER}: ${ENTRY}`)] });
  const bookPath = `${PORTABLE_DIRECTORIES["world-info"]}${slugifyHandle(BOOK)}.json`;
  const bytes = library.files.get(bookPath);
  if (bytes === undefined) {
    throw new Error(`the library export carried no ${bookPath}`);
  }
  // The carried book restores through the import door into another account, where the entry carries no metadata.
  const descriptor = box.app.portability.find((entity) => entity.kind === "world-info");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the world-info portability descriptor");
  }
  const restorer = await box.actor();
  await descriptor.importFile(restorer.id, { filename: bookPath.slice(PORTABLE_DIRECTORIES["world-info"].length), bytes });
  const restoredCaller = await box.internalCallerFor(restorer.id);
  const [restoredBook] = await restoredCaller.worldInfo.listBooks();
  if (restoredBook === undefined) {
    throw new Error("the import door restored no book");
  }
  const restored = await restoredCaller.worldInfo.listEntries({ bookId: restoredBook.id });
  expect(restored.map((exported) => [exported.content, exported.metadata])).toEqual([["It floods at dusk.", null]]);

  const named = expect.stringContaining(`"${BOOK}: ${ENTRY}"`);
  await expect(box.services.worldInfo.exportBook({ principal, bookId: book.id })).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE, message: named });
  expect(await card()).toEqual({ status: CONFLICT, body: { code: STORED_CONFIG_UNREADABLE, error: expect.stringContaining(`"${CHARACTER}: ${ENTRY}"`) } });

  // The entry editor's save sends a whole metadata blob, which repairs the entry, and every door delivers again.
  await caller.worldInfo.updateEntry({ entryId: entry.id, input: { metadata: { position: "before" } } });
  expect(await box.services.worldInfo.exportBook({ principal, bookId: book.id })).not.toBeNull();
  expect(await card()).toEqual({ status: OK, body: null });
  expect((await readLibraryExport(box, ["world-info", "character"])).report).toBeNull();
});
