// verb: attachGlobal — mark an owned script GLOBAL (it runs in every chat the caller hosts). The junction's
// PK IS the script id, so the write is idempotent by construction; the position APPENDS so a new global
// never silently reorders the existing tier.

import { globalRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("attachGlobal", () => {
  test("attaches once and is idempotent on re-attach", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "g" });

    await svc.attachGlobal({ principal: principal(owner), scriptId });
    await svc.attachGlobal({ principal: principal(owner), scriptId });

    expect(await db.select().from(globalRegexScripts).where(eq(globalRegexScripts.regexScriptId, scriptId))).toHaveLength(1);
    expect(h.userEvents.map((e) => e.event)).toEqual([
      { type: "regexChanged", scriptId },
      { type: "regexChanged", scriptId },
    ]);
  });

  test("APPENDS: a second global lands after the first, never ahead of it", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "first" });
    const second = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "second" });

    await svc.attachGlobal({ principal: principal(owner), scriptId: first });
    await svc.attachGlobal({ principal: principal(owner), scriptId: second });

    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["first", "second"]);
  });

  test("refuses a FOREIGN script and writes nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.attachGlobal({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(globalRegexScripts)).toHaveLength(0);
  });
});
