// verb: updateScript — patch an owned row. THE load-bearing property: the behavior blob MERGES. A
// `.partial()` input carries an explicit `undefined` for every omitted key, so a bare spread under
// `exactOptionalPropertyTypes` would ERASE the fields the caller never named.

import { regexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { behavior, makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("updateScript", () => {
  test("merges the behavior — a field the patch never names SURVIVES", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, {
      ownerId: owner,
      name: "before",
      behavior: behavior({ findRegex: "keep-me", replaceString: "old", trimStrings: ["x"] }),
    });

    const patched = await svc.updateScript({ principal: principal(owner), scriptId, input: { name: "after", replaceString: "new" } });

    expect(patched.name).toBe("after");
    expect(patched.replaceString).toBe("new");
    expect(patched.findRegex).toBe("keep-me");
    expect(patched.trimStrings).toEqual(["x"]);
    const [stored] = await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId));
    expect(stored?.behavior.findRegex).toBe("keep-me");
  });

  test("refuses a foreign row, writes nothing, audits nothing, emits nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.updateScript({ principal: principal(stranger), scriptId, input: { name: "hijacked" } })).rejects.toBeInstanceOf(RegexNotFoundError);
    const [stored] = await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId));
    expect(stored?.name).toBe("mine");
    expect(h.audits).toEqual([]);
    expect(h.userEvents).toEqual([]);
  });
});
