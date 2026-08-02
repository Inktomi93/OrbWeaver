// verb: detachGlobal — clear a script's GLOBAL attachment. Idempotent: an already-absent row returns
// `{detached:false}` rather than throwing, and emits NOTHING (a no-op is not an event).

import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("detachGlobal", () => {
  test("removes the row once, then reports a no-op WITHOUT emitting", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "g" });
    await svc.attachGlobal({ principal: principal(owner), scriptId });

    expect(await svc.detachGlobal({ principal: principal(owner), scriptId })).toEqual({ detached: true });
    h.userEvents.length = 0;
    expect(await svc.detachGlobal({ principal: principal(owner), scriptId })).toEqual({ detached: false });
    expect(h.userEvents).toEqual([]);
  });

  test("refuses a foreign script", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.detachGlobal({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
