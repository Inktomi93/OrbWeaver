// verb: duplicateBook — deep-copy. Load-bearing: a fresh book with a "(copy)" name + NEW ids; ALL entries
// copied verbatim with new ids; the copy is unattached (no junctions); a foreign source is NotFound.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
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

  test("a foreign source is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.duplicateBook({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
