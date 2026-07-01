// verb: applyEntryOrder — rewrite priority from a display order. Load-bearing: position i → priority N-i
// (so listEntries returns the new order); stale/foreign ids are dropped; an empty list is a 0 no-op.

import type { WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("applyEntryOrder", () => {
  test("rewrites priority so listEntries reflects the requested order", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const a = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "A", content: "c", priority: 0 },
    });
    const b = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "B", content: "c", priority: 0 },
    });

    const res = await svc.applyEntryOrder({
      principal: principal(owner),
      bookId: book.id,
      orderedEntryIds: [b.id, a.id],
    });
    expect(res.reordered).toBe(2);
    const listed = await svc.listEntries({ principal: principal(owner), bookId: book.id });
    expect(listed.map((e) => e.id)).toEqual([b.id, a.id]);
  });

  test("drops stale/foreign ids and counts only real entries", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });
    const a = await svc.createEntry({
      principal: principal(owner),
      bookId: book.id,
      input: { title: "A", content: "c" },
    });

    const res = await svc.applyEntryOrder({
      principal: principal(owner),
      bookId: book.id,
      orderedEntryIds: [castId<WorldEntryId>("world_entry_ghost"), a.id],
    });
    expect(res.reordered).toBe(1);
  });

  test("an empty order list is a 0 no-op", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "B" } });

    const res = await svc.applyEntryOrder({
      principal: principal(owner),
      bookId: book.id,
      orderedEntryIds: [],
    });
    expect(res.reordered).toBe(0);
  });
});
