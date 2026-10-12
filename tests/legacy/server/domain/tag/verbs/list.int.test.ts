// verb: listTags — returns ONLY the requesting owner's tags (cross-user isolation).
// @subject packages/server/src/domain/tag/verbs/list.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createTagService } from "#server/domain/tag/index.ts";
import { makeTagHarness, principal, seedTag, seedUser } from "../_support.ts";

describe("listTags", () => {
  test("lists the owner's tags and never another user's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    await seedTag(db, owner, { id: "tag_mine", name: "mine" });
    await seedTag(db, other, { id: "tag_theirs", name: "theirs" });

    const names = (await svc.listTags({ principal: principal(owner) })).map((t) => t.name);
    expect(names).toEqual(["mine"]);
  });
});
