// Filling an entry's blank title is an entry write, so it moves the book row's stamp like any other. A blank title is a state
// the entry verbs cannot produce (a title is required), so the case blanks it with a row write, which is why it lives in the
// persistence tier.
// @subject packages/server/src/domain/world-info/verbs/entries/backfill-titles.ts

import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { worldEntries } from "@orb/db";
import { MS_PER_HOUR } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

test("backfilling a blank entry title moves the book row's stamp", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Ledger" }) });
  const entry = await root.services.worldInfo.createEntry({
    principal,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Dock", content: "A dock." }),
  });
  // A title is backfilled from the entry's first key, so the blanked entry needs one.
  await root.services.worldInfo.updateEntry({ principal, entryId: entry.id, input: { keys: ["dock"] } });
  await root.db.update(worldEntries).set({ title: "" }).where(eq(worldEntries.id, entry.id));
  const stampOf = async (): Promise<number | undefined> =>
    (await root.services.worldInfo.listBooksWithUsage({ principal })).find((row) => row.id === book.id)?.updatedAt;
  const before = await stampOf();

  root.clock.advance(MS_PER_HOUR);
  const filled = await root.services.worldInfo.backfillTitles({ principal, bookId: book.id });
  expect(filled.filled).toBe(1);
  expect(await stampOf()).toBeGreaterThan(before ?? Number.POSITIVE_INFINITY);
});
