// The shared machine writer stores the seat its caller chose: an insert and an update both write it into the entry's
// metadata, and a write that names no seat leaves a stored seat where it is and a new entry at the default seat. A seat
// the host moved by hand is the host's: a machine re-write replaces the content it owns and leaves that seat.
// @subject packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts
// @subject packages/contracts/src/world-info/schemas.ts

import type { EntryView } from "@orb/contracts/world-info";
import { createBookSchema } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import type { EntryPosition } from "@orb/kit/world-info";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const TITLE = "auto/ledger";

async function seatsOf(root: ServerTestHarness, bookId: WorldBookId): Promise<unknown> {
  const principal = await root.principalFor(root.ownerId);
  return (await root.services.worldInfo.listEntries({ principal, bookId })).map((entry) => [entry.title, entry.metadata?.position]);
}

test("an upsert stores the seat its writer named on insert and on update, and keeps it when a later write names none", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Seats" }) });
  const upsert = (entry: { readonly content: string; readonly position?: EntryPosition }): Promise<void> =>
    root.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: TITLE, keys: ["ledger"], ...entry }] });

  await upsert({ content: "First.", position: "after" });
  expect(await seatsOf(root, book.id)).toEqual([[TITLE, "after"]]);

  await upsert({ content: "Second.", position: "authors_note_top" });
  expect(await seatsOf(root, book.id)).toEqual([[TITLE, "authors_note_top"]]);

  await upsert({ content: "Third." });
  expect(await seatsOf(root, book.id)).toEqual([[TITLE, "authors_note_top"]]);
});

test("a seat the host moved stays through a machine re-write, which still replaces the content it owns", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Moved seat" }) });
  const upsert = (entry: { readonly content: string; readonly position?: EntryPosition }): Promise<void> =>
    root.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: TITLE, keys: ["ledger"], ...entry }] });
  const only = async (): Promise<EntryView> => {
    const [entry] = await root.services.worldInfo.listEntries({ principal, bookId: book.id });
    if (entry === undefined) {
      throw new Error("the book holds no entry");
    }
    return entry;
  };

  await upsert({ content: "First.", position: "after" });
  const written = await only();
  // The host's hand: the same editor write the client sends, metadata carried through with only the seat replaced.
  await root.services.worldInfo.updateEntry({
    principal,
    entryId: written.id,
    input: { metadata: { ...written.metadata, position: "example_messages_top" } },
  });

  await upsert({ content: "Second.", position: "after" });
  const rewritten = await only();
  expect([rewritten.content, rewritten.metadata?.position]).toEqual(["Second.", "example_messages_top"]);

  // Positive control: an entry the host never moved still takes the writer's new seat in the same book.
  await root.services.worldInfo.upsertEntries({
    principal,
    bookId: book.id,
    entries: [{ title: `${TITLE}-unmoved`, keys: ["ledger"], content: "A.", position: "before" }],
  });
  await root.services.worldInfo.upsertEntries({
    principal,
    bookId: book.id,
    entries: [{ title: `${TITLE}-unmoved`, keys: ["ledger"], content: "B.", position: "after" }],
  });
  expect(await seatsOf(root, book.id)).toEqual(
    expect.arrayContaining([
      [TITLE, "example_messages_top"],
      [`${TITLE}-unmoved`, "after"],
    ]),
  );
});

test("an upsert that names no seat lands a new entry at the default seat", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Default seat" }) });
  await root.services.worldInfo.upsertEntries({ principal, bookId: book.id, entries: [{ title: TITLE, keys: ["ledger"], content: "Plain." }] });
  // Positive control: the same read sees a seat when one was written, so an absent one means the writer stored none.
  await root.services.worldInfo.upsertEntries({
    principal,
    bookId: book.id,
    entries: [{ title: `${TITLE}-seated`, keys: ["ledger"], content: "Seated.", position: "after" }],
  });
  expect(await seatsOf(root, book.id)).toEqual(
    expect.arrayContaining([
      [TITLE, undefined],
      [`${TITLE}-seated`, "after"],
    ]),
  );
});
