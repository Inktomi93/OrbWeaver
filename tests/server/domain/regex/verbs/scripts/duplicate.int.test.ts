// verb: duplicateScript — copy the body into a fresh "<name> (copy)" row. Load-bearing: the copy is
// UNATTACHED at every scope. A duplicate is a new authored artifact, not a second attachment of the
// original — cloning the source's attachments would silently double its effect in every room it ran in.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { behavior, makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("duplicateScript", () => {
  test("copies the body under a new id + '(copy)' name, leaving the ORIGINAL's attachments alone", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "original", behavior: behavior({ findRegex: "src" }) });
    await svc.attachGlobal({ principal: principal(owner), scriptId });

    const copy = await svc.duplicateScript({ principal: principal(owner), scriptId });

    expect(copy.id).not.toBe(scriptId);
    expect(copy.name).toBe("original (copy)");
    expect(copy.findRegex).toBe("src");
    // The copy is detached everywhere; only the source is still global.
    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.id)).toEqual([scriptId]);
  });

  test("refuses a foreign source", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.duplicateScript({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
  });
});
