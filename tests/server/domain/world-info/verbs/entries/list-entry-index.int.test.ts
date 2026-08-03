// verb: listEntryIndex — the lean per-book index a machine writer reads (title + keys only). Load-bearing:
// owner-gated (a foreign book is NotFound), projects only title/keys.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("listEntryIndex", () => {
  test("projects title + keys for every entry in an owned book", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "Keeper" } });
    await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "Castle", content: "c", keys: ["castle"] } });
    await svc.createEntry({ principal: principal(owner), bookId: book.id, input: { title: "River", content: "r" } });

    const index = await svc.listEntryIndex({ principal: principal(owner), bookId: book.id });

    expect(index).toContainEqual({ title: "Castle", keys: ["castle"] });
    expect(index).toContainEqual({ title: "River", keys: [] });
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(svc.listEntryIndex({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
