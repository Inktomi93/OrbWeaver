// verb: removeScript — delete an owned row. The CASCADE it triggers is pinned in the attachments suite;
// here the pins are the gate (a foreign delete is refused and leaves the row) and the emit.

import { regexScripts } from "@orb/db";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("removeScript", () => {
  test("deletes the caller's row and emits regexChanged", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "doomed" });

    expect(await svc.removeScript({ principal: principal(owner), scriptId })).toEqual({ deleted: true });
    expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(0);
    expect(h.userEvents).toEqual([{ userId: owner, event: { type: "regexChanged", scriptId } }]);
  });

  test("a foreign delete is refused and the row survives", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.removeScript({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(1);
  });
});
