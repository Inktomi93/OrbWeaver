// verb: bulkSetScriptsGlobal — add/clear the GLOBAL attachment for many owned scripts at once (REGX2).
//
// THE ORDER IS THE POINT. The global tier is an ORDERED tier the owner authors in the library's context
// pane, and `executeRegexScripts` applies its list in order — so a bulk attach must APPEND the block at the
// current end, in the caller's own order, without renumbering anything already there. A loop over
// `attachGlobal` would give the same rows; these pin that it also gives the same ORDER, and that an
// already-global script is not re-positioned by being named again.

import { globalRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("bulkSetScriptsGlobal", () => {
  test("APPENDS the block in the caller's order, after the tier that already exists", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "first" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "b" });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_3", name: "a" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: first });

    // Named b-then-a: the tier must take THAT order, not the table's and not alphabetical.
    const result = await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [b, a], global: true });

    expect(result).toEqual({ affected: 2 });
    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["first", "b", "a"]);
  });

  test("an ALREADY-global script keeps its position and is not counted twice", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "first" });
    const second = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "second" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: first });

    const result = await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [first, second], global: true });

    // Only `second` changed — and `first` did not get pushed to the back of its own tier.
    expect(result).toEqual({ affected: 1 });
    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["first", "second"]);
  });

  test("clearing detaches every named owned script, and leaves the rest of the tier alone", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const keep = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "keep" });
    const drop = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "drop" });
    await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [keep, drop], global: true });

    const result = await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [drop], global: false });

    expect(result).toEqual({ affected: 1 });
    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["keep"]);
  });

  test("a FOREIGN script cannot be attached to the caller's global tier", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    const result = await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [theirs], global: true });

    expect(result).toEqual({ affected: 0 });
    expect(await db.select().from(globalRegexScripts)).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
    expect(h.userEvents).toHaveLength(0);
  });

  // The junction has no owner column, so a bulk DETACH keyed on a bare id list would be a cross-tenant
  // write. The gate is the caller's own `loadOwnedScriptsByIds` filter — pinned here from the outside.
  test("a FOREIGN script's global attachment survives a caller's bulk clear", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });
    await svc.attachGlobal({ principal: principal(stranger), scriptId: theirs });

    const result = await svc.bulkSetScriptsGlobal({ principal: principal(owner), scriptIds: [theirs], global: false });

    expect(result).toEqual({ affected: 0 });
    expect(await db.select().from(globalRegexScripts)).toHaveLength(1);
  });
});
