// verb: getEntry — owner-scoped via the book. Load-bearing: an entry inside another user's book is NotFound
// (the join-through-book ownership gate).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("getEntry", () => {
  test("returns an owned entry", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const entry = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "E", content: "c" },
    });

    const got = await svc.getEntry({ principal: principal(owner), entryId: entry.id });
    expect(got.id).toBe(entry.id);
  });

  test("an entry in another user's book is NotFound", async () => {
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

    await expect(svc.getEntry({ principal: principal(owner), entryId: theirEntry.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
