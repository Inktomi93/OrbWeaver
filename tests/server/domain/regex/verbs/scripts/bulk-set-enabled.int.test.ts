// verb: bulkSetScriptsEnabled — switch many owned scripts on/off in one statement (REGX2).
//
// The two properties that make this a VERB rather than a client loop: the whole batch is one owner-scoped
// write with ONE audit row and ONE `regexChanged` emit, and a foreign id is DROPPED rather than thrown on —
// a bulk verb that refused the first id the caller no longer owns would be an ownership oracle over a list.

import { regexScripts } from "@orb/db";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("bulkSetScriptsEnabled", () => {
  test("flips every named owned script in ONE write, with ONE audit and ONE emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });

    const result = await svc.bulkSetScriptsEnabled({ principal: principal(owner), scriptIds: [a, b], enabled: false });

    expect(result).toEqual({ affected: 2 });
    expect((await db.select().from(regexScripts)).map((r) => r.enabled)).toEqual([false, false]);
    // ONE user gesture, ONE repaint — the reason the batch verb exists at all.
    expect(h.userEvents).toHaveLength(1);
    expect(h.userEvents[0]?.event).toEqual({ type: "regexChanged" });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.action).toBe("regex.bulkDisableScripts");
    expect(h.audits[0]?.entry.metadata).toEqual({ count: 2, bulk: true });
  });

  test("a FOREIGN id is silently dropped — never an oracle, and never a foreign write", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    const result = await svc.bulkSetScriptsEnabled({ principal: principal(owner), scriptIds: [mine, theirs], enabled: false });

    // The count is the honest answer, and it is the SAME number a caller would get for an id that never
    // existed — so the verb cannot be used to test whether a stranger owns a given script.
    expect(result).toEqual({ affected: 1 });
    const [strangerRow] = await db.select().from(regexScripts).where(eq(regexScripts.id, theirs));
    expect(strangerRow?.enabled).toBe(true);
  });

  test("an empty / all-foreign batch writes nothing, audits nothing and emits nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const empty = await svc.bulkSetScriptsEnabled({ principal: principal(owner), scriptIds: [], enabled: false });
    const ghost = await svc.bulkSetScriptsEnabled({
      principal: principal(owner),
      scriptIds: [castId<RegexScriptId>("regex_script_nothere")],
      enabled: false,
    });

    expect([empty, ghost]).toEqual([{ affected: 0 }, { affected: 0 }]);
    expect(h.audits).toHaveLength(0);
    expect(h.userEvents).toHaveLength(0);
  });

  test("the BEHAVIOR blob is untouched — `enabled` is a promoted column, not part of the body", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const before = (await db.select().from(regexScripts).where(eq(regexScripts.id, a)))[0]?.behavior;

    await svc.bulkSetScriptsEnabled({ principal: principal(owner), scriptIds: [a], enabled: false });

    expect((await db.select().from(regexScripts).where(eq(regexScripts.id, a)))[0]?.behavior).toEqual(before);
  });
});
