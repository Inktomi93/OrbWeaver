// A stored lore entry's metadata reads back as stored: a key this release does not declare (a preserved ST field)
// rides through as JSON however deep, an absent known field stays absent, and a known field out of shape heals the
// blob to null.
// @subject packages/contracts/src/world-info/schemas.ts
// @subject packages/server/src/domain/world-info/persistence/queries.ts
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
