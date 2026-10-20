// verb: listGlobal — the caller's global books only (owner-scoped via the book). Load-bearing: another
// user's global book never surfaces; newest first.
// @subject packages/server/src/domain/world-info/verbs/attachments/list-global.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createWorldInfoService } from "#server/domain/world-info/index.ts";
import { makeHarness, principal, seedUser } from "../../_support.ts";

describe("listGlobal", () => {
  test("returns only the caller's global books, newest first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createWorldInfoService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });

    const first = await svc.createBook({ principal: await principal(db, owner), input: { name: "First" } });
    h.advance(1000);
    const second = await svc.createBook({ principal: await principal(db, owner), input: { name: "Second" } });
    const theirs = await svc.createBook({ principal: await principal(db, other), input: { name: "Theirs" } });
    await svc.attachGlobal({ principal: await principal(db, owner), bookId: first.id });
    await svc.attachGlobal({ principal: await principal(db, owner), bookId: second.id });
    await svc.attachGlobal({ principal: await principal(db, other), bookId: theirs.id });

    const globals = await svc.listGlobal({ principal: await principal(db, owner) });
    expect(globals.map((b) => b.id)).toEqual([second.id, first.id]);
  });

  // TOTAL ORDER (test-determinism) — the same tiebreak the four attachment lists share: `createdAt` ties
  // between books minted in one instant, and without `id DESC` the roster order is whatever the scan gave.
  test("books attached in the SAME instant list in a stable total order (newest id first)", async () => {
    const db = await freshDb();
    const svc = createWorldInfoService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const a = await svc.createBook({ principal: await principal(db, owner), input: { name: "A" } });
    const b = await svc.createBook({ principal: await principal(db, owner), input: { name: "B" } });
    // Attached in ASCENDING id order so the scan order is the opposite of the expected one — a pass here
    // cannot be insertion order wearing a sort's clothes.
    await svc.attachGlobal({ principal: await principal(db, owner), bookId: a.id });
    await svc.attachGlobal({ principal: await principal(db, owner), bookId: b.id });

    expect((await svc.listGlobal({ principal: await principal(db, owner) })).map((x) => x.id)).toEqual([b.id, a.id]);
  });
});
