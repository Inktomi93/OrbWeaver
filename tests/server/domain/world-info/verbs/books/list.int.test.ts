// verb: listBooks — owner-scoped, newest first. Load-bearing: only the caller's books surface (another
// user's are excluded), ordered by descending createdAt.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("listBooks", () => {
  test("returns only the caller's books, newest first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    const first = await svc.createBook({ principal: principal(owner), input: { name: "First" } });
    h.advance(1000);
    const second = await svc.createBook({ principal: principal(owner), input: { name: "Second" } });
    await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    const books = await svc.listBooks({ principal: principal(owner) });
    expect(books.map((b) => b.id)).toEqual([second.id, first.id]);
  });

  test("empty array when the caller has none", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    expect(await svc.listBooks({ principal: principal(owner) })).toEqual([]);
  });
});
