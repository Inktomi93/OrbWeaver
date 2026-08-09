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
import { expect, test } from "../../../../../support/fixtures.ts";
import { behavior, makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

/** One hour of frozen-clock advance — enough to make a moved stamp unmistakable. */
const ONE_HOUR_MS = 3_600_000;

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

  // X-16: the library list's only discriminator between four rows all named "New script" is the edit stamp,
  // so a patch that does not move it makes the fix inert. Asserted against the STORED row, not the return
  // value, because the list re-reads from the table.
  test("moves updatedAt to the write instant, and leaves createdAt where it was", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "before" });
    const [born] = await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId));

    h.advance(ONE_HOUR_MS);
    const patched = await svc.updateScript({ principal: principal(owner), scriptId, input: { name: "after" } });

    const [stored] = await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId));
    expect(stored?.updatedAt).toBe((born?.updatedAt ?? 0) + ONE_HOUR_MS);
    expect(stored?.createdAt).toBe(born?.createdAt); // birth is not an edit
    expect(patched.updatedAt).toBe(stored?.updatedAt); // the returned row agrees with the table
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
