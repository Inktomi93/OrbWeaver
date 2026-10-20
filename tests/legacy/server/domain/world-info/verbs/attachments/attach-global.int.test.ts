// verb: attachGlobal — mark an owned book global. Load-bearing: the gate is plain book ownership (a foreign
// book is NotFound); it is idempotent; the book then appears in listGlobal.
// @subject packages/server/src/domain/world-info/verbs/attachments/attach-global.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService, WorldInfoNotFoundError } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("attachGlobal", () => {
  test("marks an owned book global (idempotent)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const book = await svc.createBook({ principal: await principal(db, owner), input: { name: "G" } });

    await svc.attachGlobal({ principal: await principal(db, owner), bookId: book.id });
    await svc.attachGlobal({ principal: await principal(db, owner), bookId: book.id });

    const globals = await svc.listGlobal({ principal: await principal(db, owner) });
    expect(globals.map((b) => b.id)).toEqual([book.id]);
    expect(globals[0]?.role).toBeNull();
  });

  test("a foreign book is NotFound", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const theirs = await svc.createBook({ principal: await principal(db, other), input: { name: "T" } });

    await expect(svc.attachGlobal({ principal: await principal(db, owner), bookId: theirs.id })).rejects.toBeInstanceOf(WorldInfoNotFoundError);
  });
});
