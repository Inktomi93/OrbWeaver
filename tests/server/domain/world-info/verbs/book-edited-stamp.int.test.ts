// The library row's updatedAt is the book's last change, derived at read time: the newer of the book row's own stamp
// (a rename moves it) and its entries' newest stamp (writing or editing an entry moves it). The row stores nothing for it.
// @subject packages/server/src/domain/world-info/verbs/books/update.ts
// @subject packages/server/src/domain/world-info/verbs/entries/update.ts

import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import { MS_PER_HOUR } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

async function bookStamp(root: ServerTestHarness, bookId: WorldBookId): Promise<number> {
  const principal = await root.principalFor(root.ownerId);
  const book = (await root.services.worldInfo.listBooksWithUsage({ principal })).find((row) => row.id === bookId);
  if (book === undefined) {
    throw new Error("the book is not listed");
  }
  return book.updatedAt;
}

test("an entry written or edited moves the book row's stamp to that entry's, and a rename still moves it", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Ledger" }) });
  const created = await bookStamp(root, book.id);

  root.clock.advance(MS_PER_HOUR);
  const entry = await root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Harbor", content: "A harbor.", keys: ["harbor"] }),
  });
  expect(entry.updatedAt).toBeGreaterThan(created);
  expect(await bookStamp(root, book.id)).toBe(entry.updatedAt);

  root.clock.advance(MS_PER_HOUR);
  const edited = await root.services.worldInfo.updateEntry({ principal, entryId: entry.id, input: { content: "A loud harbor." } });
  expect(edited.updatedAt).toBeGreaterThan(entry.updatedAt);
  expect(await bookStamp(root, book.id)).toBe(edited.updatedAt);

  // Positive control: the book's own edit, newer than every entry, moves it.
  root.clock.advance(MS_PER_HOUR);
  await root.services.worldInfo.updateBook({ principal, bookId: book.id, input: { name: "Ledger of harbors" } });
  expect(await bookStamp(root, book.id)).toBeGreaterThan(edited.updatedAt);
});

test("removing the newest entry moves the book row's stamp forward, never back to an older entry's", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Ledger" }) });
  const older = await root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Dock", content: "A dock." }),
  });
  root.clock.advance(MS_PER_HOUR);
  const newest = await root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Harbor", content: "A harbor." }),
  });
  const beforeRemoval = await bookStamp(root, book.id);
  expect(beforeRemoval).toBe(newest.updatedAt);
  expect(beforeRemoval).toBeGreaterThan(older.updatedAt);

  root.clock.advance(MS_PER_HOUR);
  await root.services.worldInfo.removeEntry({ principal, entryId: newest.id });
  expect(await bookStamp(root, book.id)).toBeGreaterThan(beforeRemoval);
});

test("a rename moves the book row's stamp past every entry's", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Ledger" }) });
  const entry = await root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Dock", content: "A dock." }),
  });
  root.clock.advance(MS_PER_HOUR);
  await root.services.worldInfo.updateBook({ principal, bookId: book.id, input: { name: "Ledger of docks" } });
  expect(await bookStamp(root, book.id)).toBeGreaterThan(entry.updatedAt);
});
