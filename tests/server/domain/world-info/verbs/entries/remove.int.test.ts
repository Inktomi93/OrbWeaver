// verb: removeEntry — owner-scoped via the owned-book inArray subquery (invariant #4). Load-bearing: a
// foreign entry id is NotFound (never a silent cross-tenant delete); an owned entry deletes.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("removeEntry", () => {
  test("deletes an owned entry", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    const res = await svc.removeEntry({ principal: principal(owner), entryId: entry.id });
    expect(res.deleted).toBe(true);
    await expect(svc.getEntry({ principal: principal(owner), entryId: entry.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });

  test("a foreign entry id is NotFound — no cross-tenant delete", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirBook = await svc.createBook({ principal: principal(other), input: { name: "T" } });
    const theirEntry = await svc.createEntry({
      principal: principal(other),
      bookId: theirBook.id,
      input: { title: "E", content: "c" },
    });

    await expect(svc.removeEntry({ principal: principal(owner), entryId: theirEntry.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
    const still = await svc.getEntry({ principal: principal(other), entryId: theirEntry.id });
    expect(still.id).toBe(theirEntry.id);
  });
});
