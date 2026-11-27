// A book's updatedAt is the stamp of the book row itself: a rename moves it, and creating, editing or removing an entry
// does not. The library row labels it as the book's own details edit, so this is the behaviour that label rests on.
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

test("an entry written, edited and removed leaves the book's edit stamp where the book's own edit put it", async () => {
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
  root.clock.advance(MS_PER_HOUR);
  const edited = await root.services.worldInfo.updateEntry({ principal, entryId: entry.id, input: { content: "A loud harbor." } });
  root.clock.advance(MS_PER_HOUR);
  await root.services.worldInfo.removeEntry({ principal, entryId: entry.id });

  // The entry's own stamp moved with each write, so the book stamp holding still is the verbs' contract, not a clock that stood still.
  expect(edited.updatedAt).toBeGreaterThan(entry.updatedAt);
  expect(await bookStamp(root, book.id)).toBe(created);

  // Positive control: the book's own edit moves it.
  root.clock.advance(MS_PER_HOUR);
  await root.services.worldInfo.updateBook({ principal, bookId: book.id, input: { name: "Ledger of harbors" } });
  expect(await bookStamp(root, book.id)).toBeGreaterThan(created);
});
