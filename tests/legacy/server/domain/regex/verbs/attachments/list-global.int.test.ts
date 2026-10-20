// verb: listGlobal — the caller's globally-attached scripts, in EXECUTION order (position, then createdAt).
// @subject packages/server/src/domain/regex/verbs/attachments/list-global.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createRegexService } from "#server/domain/regex/index.ts";
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
    await svc.attachGlobal({ principal: await principal(db, owner), scriptId: a });
    await svc.attachGlobal({ principal: await principal(db, owner), scriptId: b });
    await svc.attachGlobal({ principal: await principal(db, stranger), scriptId: theirs });

    expect((await svc.listGlobal({ principal: await principal(db, owner) })).map((r) => r.name)).toEqual(["a", "b"]);
  });
});
