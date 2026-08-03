// verb: attachToPreset — attach an owned script to an owned preset. BOTH ends are gated: a foreign script
// and a foreign preset are each refused with the same not-found answer. Positions APPEND.

import { presetRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedPreset, seedScript, seedUser } from "../../_support.ts";

describe("attachToPreset", () => {
  test("attaches, is idempotent, and APPENDS in attach order", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const presetId = await seedPreset(db, owner);
    const first = await seedScript(db, { ownerId: owner, id: "regex_script_1", name: "first" });
    const second = await seedScript(db, { ownerId: owner, id: "regex_script_2", name: "second" });

    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: first });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: first });
    await svc.attachToPreset({ principal: principal(owner), presetId, scriptId: second });

    expect(await db.select().from(presetRegexScripts).where(eq(presetRegexScripts.presetId, presetId))).toHaveLength(2);
    expect((await svc.listForPreset({ principal: principal(owner), presetId })).map((r) => r.name)).toEqual(["first", "second"]);
  });

  test("refuses a FOREIGN script", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const presetId = await seedPreset(db, owner);
    const scriptId = await seedScript(db, { ownerId: stranger, name: "theirs" });

    await expect(svc.attachToPreset({ principal: principal(owner), presetId, scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(presetRegexScripts)).toHaveLength(0);
  });
});
