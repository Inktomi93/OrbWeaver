// verb: listBooks — owner-scoped, newest first. Load-bearing: only the caller's books surface (another
// user's are excluded), ordered by descending createdAt.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
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

  // TOTAL ORDER (test-determinism): `createdAt` is not unique — several books minted in the same
  // millisecond (an import run, a bundle restore) tie, and a tie-free-of-tiebreak leaves the order to
  // whatever the storage engine scans, so the same library renders differently run to run. The id is the
  // tiebreak: TypeIDs are uuidv7-backed, so `id DESC` continues "newest first" rather than inventing a
  // second axis.
  test("books minted in the SAME instant list in a stable total order (newest id first)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const a = await svc.createBook({ principal: principal(owner), input: { name: "A" } });
    const b = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const c = await svc.createBook({ principal: principal(owner), input: { name: "C" } });

    const books = await svc.listBooks({ principal: principal(owner) });
    expect(books.map((x) => x.id)).toEqual([c.id, b.id, a.id]);
  });

  test("empty array when the caller has none", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    expect(await svc.listBooks({ principal: principal(owner) })).toEqual([]);
  });
});
