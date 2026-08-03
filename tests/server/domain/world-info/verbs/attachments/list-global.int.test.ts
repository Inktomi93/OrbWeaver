// verb: listGlobal — the caller's global books only (owner-scoped via the book). Load-bearing: another
// user's global book never surfaces; newest first.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("listGlobal", () => {
  test("returns only the caller's global books, newest first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    const first = await svc.createBook({ principal: principal(owner), input: { name: "First" } });
    h.advance(1000);
    const second = await svc.createBook({ principal: principal(owner), input: { name: "Second" } });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "Theirs" } });
    await svc.attachGlobal({ principal: principal(owner), bookId: first.id });
    await svc.attachGlobal({ principal: principal(owner), bookId: second.id });
    await svc.attachGlobal({ principal: principal(other), bookId: theirs.id });

    const globals = await svc.listGlobal({ principal: principal(owner) });
    expect(globals.map((b) => b.id)).toEqual([second.id, first.id]);
  });
});
