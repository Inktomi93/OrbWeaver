// verb: listScripts — the caller's library, newest first. Load-bearing: OWNER-SCOPED in the WHERE (a
// stranger's rows are not merely filtered from the view, they are never selected).

import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("listScripts", () => {
  test("returns only the caller's rows, newest first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    await seedScript(db, { ownerId: owner, id: "regex_script_old", name: "old", createdAt: 1000 });
    await seedScript(db, { ownerId: owner, id: "regex_script_new", name: "new", createdAt: 2000 });
    await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    expect((await svc.listScripts({ principal: principal(owner) })).map((r) => r.name)).toEqual(["new", "old"]);
  });

  test("an empty library is an empty list, not a throw", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: "owner" });
    expect(await createRegexService(h.ctx).listScripts({ principal: principal(owner) })).toEqual([]);
  });
});
