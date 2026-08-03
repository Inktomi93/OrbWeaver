// verb: listGlobal — the caller's globally-attached scripts, in EXECUTION order (position, then createdAt).

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { makeHarness, principal, seedScript, seedUser } from "../../_support.ts";

describe("listGlobal", () => {
  test("returns the owner's global tier in position order, excluding a stranger's globals", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_t", name: "theirs" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachGlobal({ principal: principal(owner), scriptId: b });
    await svc.attachGlobal({ principal: principal(stranger), scriptId: theirs });

    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["a", "b"]);
  });
});
