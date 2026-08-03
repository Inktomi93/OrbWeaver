// verb: createScript — owner-scoped mint. Load-bearing: the row is owned by `principal.userId` (never a
// `users` read), the BEHAVIOR lands in the JSON column while name/enabled are promoted, and every create
// audits + emits `regexChanged`.

import { regexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { behavior, makeHarness, principal, seedUser } from "../../_support.ts";

describe("createScript", () => {
  test("mints a row owned by the caller, splitting promoted columns from the behavior blob", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const row = await svc.createScript({
      principal: principal(owner),
      input: { name: "strip ooc", enabled: true, ...behavior({ findRegex: "\\(ooc\\)", replaceString: "" }) },
    });

    expect(row.name).toBe("strip ooc");
    expect(row.findRegex).toBe("\\(ooc\\)");
    const [stored] = await db.select().from(regexScripts).where(eq(regexScripts.id, row.id));
    expect(stored?.ownerId).toBe(owner);
    // name/enabled are COLUMNS (the list panel's hot fields); everything else is the typed blob.
    expect(stored?.name).toBe("strip ooc");
    expect(stored?.enabled).toBe(true);
    expect(stored?.behavior.findRegex).toBe("\\(ooc\\)");
  });

  test("audits the create and emits regexChanged with the new id", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const row = await svc.createScript({ principal: principal(owner), input: { name: "n", enabled: true, ...behavior() } });

    expect(h.audits.map((a) => a.entry.action)).toEqual(["regex.createScript"]);
    expect(h.userEvents).toEqual([{ userId: owner, event: { type: "regexChanged", scriptId: row.id } }]);
  });
});
