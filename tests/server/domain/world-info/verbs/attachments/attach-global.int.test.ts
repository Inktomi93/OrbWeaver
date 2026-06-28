// verb: attachGlobal — mark an owned book global. Load-bearing: the gate is plain book ownership (a foreign
// book is NotFound); it is idempotent; the book then appears in listGlobal.

import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("attachGlobal", () => {
  test("marks an owned book global (idempotent)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "G" } });

    await svc.attachGlobal({ principal: principal(owner), bookId: book.id });
    await svc.attachGlobal({ principal: principal(owner), bookId: book.id });

    const globals = await svc.listGlobal({ principal: principal(owner) });
    expect(globals.map((b) => b.id)).toEqual([book.id]);
    expect(globals[0]?.role).toBeNull();
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "T" } });

    await expect(
      svc.attachGlobal({ principal: principal(owner), bookId: theirs.id }),
    ).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
