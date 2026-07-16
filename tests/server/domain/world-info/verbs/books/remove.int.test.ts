// verb: removeBook — owner-scoped delete. Load-bearing: the DB CASCADE clears the book's entries (entries
// have no independent existence); a foreign book is NotFound.

import { worldEntries } from "@orb/db";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("removeBook", () => {
  test("deletes an owned book and cascades its entries", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Doomed" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    const res = await svc.removeBook({ principal: principal(owner), bookId: book.id });
    expect(res.deleted).toBe(true);
    const orphans = await db.select().from(worldEntries).where(eq(worldEntries.id, entry.id));
    expect(orphans).toHaveLength(0);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.removeBook({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
