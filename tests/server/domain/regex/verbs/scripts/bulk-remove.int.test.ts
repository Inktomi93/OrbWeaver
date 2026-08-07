// verb: bulkRemoveScripts — delete many owned scripts in one statement (REGX2).
//
// The property that matters most is the one the FK model exists for: the CASCADE clears every junction row
// for each deleted script, so a bulk delete can never leave a dangling attachment. The other is the
// deliberate divergence from the single `removeScript`, which THROWS on a foreign/absent id: a bulk gesture
// over a visible list is routinely raced by another device, and aborting the whole batch because one row
// vanished would be worse than the honest count.

import { characterRegexScripts, globalRegexScripts, regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedScript, seedUser } from "../../_support.ts";

describe("bulkRemoveScripts", () => {
  test("deletes the owned rows and CASCADES every junction they were attached through", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: b });

    const result = await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [a, b] });

    expect(result).toEqual({ affected: 2 });
    expect(await db.select().from(regexScripts)).toHaveLength(0);
    expect(await db.select().from(globalRegexScripts)).toHaveLength(0);
    expect(await db.select().from(characterRegexScripts)).toHaveLength(0);
  });

  test("a FOREIGN script survives, and the count reports only what was really deleted", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    const result = await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [mine, theirs] });

    expect(result).toEqual({ affected: 1 });
    expect((await db.select().from(regexScripts)).map((r) => r.id)).toEqual([theirs]);
  });

  // The divergence from the single verb, stated as a test so nobody "fixes" it into a throw later.
  test("an id that is already gone does NOT abort the batch", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });

    const result = await svc.bulkRemoveScripts({
      principal: principal(owner),
      scriptIds: [castId<RegexScriptId>("regex_script_vanished"), mine],
    });

    expect(result).toEqual({ affected: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(0);
    expect(h.audits).toHaveLength(1);
    expect(h.userEvents).toHaveLength(1);
  });
});
