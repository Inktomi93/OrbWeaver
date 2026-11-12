// A stored lore entry's metadata reads back as stored: a key this release does not declare (a preserved ST field)
// rides through as JSON however deep, an absent known field stays absent, and a known field out of shape heals the
// blob to null. Stored text that is not JSON reads and exports as null, and the machine writer leaves that entry alone.
// @subject packages/contracts/src/world-info/schemas.ts
// @subject packages/server/src/domain/world-info/persistence/queries.ts
// @subject packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts
// @subject packages/server/src/domain/world-info/verbs/export.ts
import { worldEntries } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";

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

test("lore entry metadata holding text that is not JSON reads and exports as none, and the machine writer keeps its bytes", async ({ harness }) => {
  const notJson = '{"scopeMode": "alw';
  const principal = await harness.principalFor(harness.ownerId);
  const caller = await harness.internalCallerFor(harness.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: "Atlas" } });
  await harness.services.worldInfo.upsertEntries({
    principal,
    bookId: book.id,
    entries: [{ title: "Harbor", keys: ["harbor"], content: "It floods at dusk." }],
  });
  const [entry] = await harness.db.select({ id: worldEntries.id }).from(worldEntries).where(eq(worldEntries.worldBookId, book.id));
  if (entry === undefined) {
    throw new Error("the machine writer did not insert its entry");
  }
  await harness.db
    .update(worldEntries)
    .set({ metadata: sql`${notJson}` })
    .where(eq(worldEntries.id, entry.id));
  const stored = async (): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${worldEntries.metadata}`, content: worldEntries.content })
      .from(worldEntries)
      .where(eq(worldEntries.id, entry.id));

  expect((await caller.worldInfo.getEntry({ entryId: entry.id })).metadata).toBeNull();
  await harness.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: "Harbor", keys: ["harbor"], content: "It never floods." }] });
  expect(await stored()).toEqual([{ text: notJson, content: "It floods at dusk." }]);

  const descriptor = harness.app.portability.find((entity) => entity.kind === "world-info");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the world-info portability descriptor");
  }
  const files: Parameters<typeof descriptor.importFile>[1][] = [];
  for await (const file of descriptor.exportAll(harness.ownerId)) {
    files.push(file);
  }
  const [file] = files;
  if (file === undefined) {
    throw new Error("the export wrote no book");
  }
  // The exported file restores through the import door into another account, where the entry carries no metadata.
  const restorer = await harness.actor();
  await descriptor.importFile(restorer.id, file);
  const restoredCaller = await harness.internalCallerFor(restorer.id);
  const [restoredBook] = await restoredCaller.worldInfo.listBooks();
  if (restoredBook === undefined) {
    throw new Error("the import door restored no book");
  }
  const restored = await restoredCaller.worldInfo.listEntries({ bookId: restoredBook.id });
  expect(restored.map((exported) => [exported.content, exported.metadata])).toEqual([["It floods at dusk.", null]]);
});
