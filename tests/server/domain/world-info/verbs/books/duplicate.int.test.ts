// verb: duplicateBook — deep-copy. Load-bearing: a fresh book with a "(copy)" name + NEW ids; ALL entries
// copied verbatim with new ids; the copy is unattached (no junctions); a foreign source is NotFound.

import { worldEntries } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { FROZEN_AT_MS } from "../../../../../support/clock.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("duplicateBook", () => {
  test("copies the book + its entries into a fresh '(copy)' with new ids", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Source" } });
    await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "Lore A", content: "alpha", keys: ["a"], priority: 5 },
    });

    const copy = await svc.duplicateBook({ principal: principal(owner), bookId: book.id });

    expect(copy.id).not.toBe(book.id);
    expect(copy.name).toBe("Source (copy)");
    const sourceEntries = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    const copyEntries = await svc.listEntries({ principal: principal(owner), bookId: copy.id });
    expect(copyEntries).toHaveLength(1);
    expect(copyEntries[0]?.id).not.toBe(sourceEntries[0]?.id);
    expect(copyEntries[0]?.title).toBe("Lore A");
    expect(copyEntries[0]?.content).toBe("alpha");
    expect(copyEntries[0]?.keys).toEqual(["a"]);
    expect(copyEntries[0]?.priority).toBe(5);
  });

  test("the copy carries no attachments (fresh, unattached)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Src" } });
    await svc.attachGlobal({ principal: principal(owner), bookId: book.id });

    const copy = await svc.duplicateBook({ principal: principal(owner), bookId: book.id });
    const globals = await svc.listGlobal({ principal: principal(owner) });
    expect(globals.map((b) => b.id)).toEqual([book.id]);
    expect(globals.map((b) => b.id)).not.toContain(copy.id);
  });

  // The copy is a NEW row, so every stamp on it is the copy's own. The entry spread overrode `createdAt` but
  // carried the SOURCE's `updatedAt` through, so a freshly duplicated entry claimed it was last edited before
  // the book that contains it existed — the "edited" stamp a list pane sorts on (the worldEntries.updatedAt
  // schema note) reporting an event that never happened to this row.
  test("copied entries are stamped with the COPY's clock, not the source's updatedAt", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Source" } });
    const entry = await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "Lore A", content: "alpha" } });
    // An EDIT is what puts a deterministic (and, by the time of the copy, stale) stamp on the source row —
    // only the update verbs stamp `updatedAt` from the injected clock; an insert takes the column default.
    await svc.updateEntry({ principal: principal(owner), entryId: entry.id, input: { content: "beta" } });
    h.advance(5000);

    const copy = await svc.duplicateBook({ principal: principal(owner), bookId: book.id });

    const copied = await db
      .select({ createdAt: worldEntries.createdAt, updatedAt: worldEntries.updatedAt })
      .from(worldEntries)
      .where(eq(worldEntries.worldBookId, copy.id));
    expect(copied).toEqual([{ createdAt: FROZEN_AT_MS + 5000, updatedAt: FROZEN_AT_MS + 5000 }]);
    // The source keeps its own edit stamp — the copy neither takes it nor rewrites it.
    const sourceStamps = await db.select({ updatedAt: worldEntries.updatedAt }).from(worldEntries).where(eq(worldEntries.worldBookId, book.id));
    expect(sourceStamps).toEqual([{ updatedAt: FROZEN_AT_MS }]);
  });

  test("a foreign source is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.duplicateBook({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
