// verb: getScript — one owned row. Load-bearing: a foreign row and an absent row collapse to the SAME
// answer, so the verb can never be used as an existence oracle for someone else's library.

import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("getScript", () => {
  test("returns the caller's row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    expect((await svc.getScript({ principal: principal(owner), scriptId })).name).toBe("mine");
    // A read audits nothing and emits nothing.
    expect(h.audits).toEqual([]);
    expect(h.userEvents).toEqual([]);
  });

  test("a FOREIGN row and an ABSENT row are one answer (no existence oracle)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.getScript({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    await expect(svc.getScript({ principal: principal(owner), scriptId: castId<RegexScriptId>("regex_script_absent") })).rejects.toBeInstanceOf(
      RegexNotFoundError,
    );
  });
});
