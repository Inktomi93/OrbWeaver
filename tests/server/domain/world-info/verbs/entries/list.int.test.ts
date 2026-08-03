// verb: listEntries — entries of an owned book, by descending priority. Load-bearing: a foreign book is
// NotFound (can't probe a foreign book's entry set); ordering is priority DESC.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("listEntries", () => {
  test("returns the book's entries by descending priority", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const low = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "Low", content: "c", priority: 1 },
    });
    const high = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "High", content: "c", priority: 10 },
    });

    const entries = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(entries.map((e) => e.id)).toEqual([high.id, low.id]);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.listEntries({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
