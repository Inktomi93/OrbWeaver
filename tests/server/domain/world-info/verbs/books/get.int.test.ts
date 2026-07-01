// verb: getBook — owner-scoped read. Load-bearing: a foreign or missing book collapses to NotFound (no
// foreign-existence leak).

import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("getBook", () => {
  test("returns an owned book", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.createBook({ principal: principal(owner), input: { name: "Lore" } });

    const got = await svc.getBook({ principal: principal(owner), bookId: created.id });
    expect(got.id).toBe(created.id);
  });

  test("another user's book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });

    await expect(
      svc.getBook({ principal: principal(owner), bookId: theirs.id }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });

  test("a missing book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await expect(
      svc.getBook({
        principal: principal(owner),
        bookId: castId<WorldBookId>("world_book_missing"),
      }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
