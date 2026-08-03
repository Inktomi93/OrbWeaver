// verb: detachGlobal — un-mark an owned book global (idempotent). Load-bearing: detached:true on a real
// removal, detached:false when not global; a foreign book is NotFound.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createWorldInfoService, WorldInfoNotFoundError } from "@orb/server/domain/world-info";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("detachGlobal", () => {
  test("removes the global flag, then is idempotent", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: principal(owner), input: { name: "G" } });
    await svc.attachGlobal({ principal: principal(owner), bookId: book.id });

    const first = await svc.detachGlobal({ principal: principal(owner), bookId: book.id });
    const second = await svc.detachGlobal({ principal: principal(owner), bookId: book.id });
    expect(first.detached).toBe(true);
    expect(second.detached).toBe(false);
    expect(await svc.listGlobal({ principal: principal(owner) })).toEqual([]);
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: principal(other), input: { name: "T" } });

    await expect(svc.detachGlobal({ principal: principal(owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
