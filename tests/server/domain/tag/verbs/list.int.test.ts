// verb: listTags — returns ONLY the requesting owner's tags (cross-user isolation).

import { createTagService } from "@orb/server/domain/tag";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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
