// A copied lore book and its entries are new rows: both stamps of each are the injected clock at the copy, through the
// duplicate verb and through the host-handoff copy the nominee's accept runs.
// @subject packages/server/src/domain/world-info/verbs/books/duplicate.ts
// @subject packages/server/src/domain/world-info/persistence/handoff-copy-write.ts
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { worldBooks, worldEntries } from "@orb/db";
import type { WorldBookId } from "@orb/kit/ids";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { attachRoomAttachments, handOff } from "../../chat/handoff-attachments-physical.ts";
import { invitePerson } from "../../chat/persona-cache-physical.ts";
import { textRoom } from "../../chat/scenario-physical.ts";

const STEP_MS = 60_000;

async function stamps(h: ChatRoot, bookId: WorldBookId): Promise<readonly (readonly [number, number])[]> {
  const [book] = await h.root.db.select({ createdAt: worldBooks.createdAt, updatedAt: worldBooks.updatedAt }).from(worldBooks).where(eq(worldBooks.id, bookId));
  const entries = await h.root.db
    .select({ createdAt: worldEntries.createdAt, updatedAt: worldEntries.updatedAt })
    .from(worldEntries)
    .where(eq(worldEntries.worldBookId, bookId));
  return [book, ...entries].flatMap((row) => (row === undefined ? [] : [[row.createdAt, row.updatedAt] as const]));
}

test("a duplicated book and its entries carry the clock at the duplicate in both stamps", async () => {
  await using h = await textRoom([]);
  const book = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "Atlas" }) });
  await h.root.services.worldInfo.createEntry({ principal: h.owner, bookId: book.id, input: createEntrySchema.parse({ title: "Harbor", content: "Tides." }) });
  h.root.clock.advance(STEP_MS);
  const at = h.root.clock.now();

  const copy = await h.root.services.worldInfo.duplicateBook({ principal: h.owner, bookId: book.id });

  expect(await stamps(h, copy.id)).toEqual([
    [at, at],
    [at, at],
  ]);
});

test("a room book the nominee's accept copies carries the clock at the accept in both stamps", async () => {
  await using h = await textRoom([]);
  const attached = await attachRoomAttachments(h, h.owner, { lore: "Harbor lore.", find: "tide", replace: "TIDE" });
  const nominee = await invitePerson(h);
  h.root.clock.advance(STEP_MS);
  const at = h.root.clock.now();

  await handOff(h, nominee, true);

  const copies = await h.root.db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, nominee.userId));
  expect(copies).toHaveLength(1);
  const [copy] = nonEmpty(copies);
  expect(copy.id).not.toBe(attached.bookId);
  expect(await stamps(h, copy.id)).toEqual([
    [at, at],
    [at, at],
  ]);
});
