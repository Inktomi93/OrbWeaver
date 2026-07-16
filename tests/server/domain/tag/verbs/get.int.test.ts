// verb: getTag — owner-scoped fetch; a foreign/missing id is not-found (never another user's row).

import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedTag, seedUser } from "../_support.ts";

describe("getTag", () => {
  test("returns the owner's tag", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await expect(svc.getTag({ principal: principal(owner), tagId })).resolves.toMatchObject({
      id: tagId,
      name: "alpha",
    });
  });

  test("a foreign owner's tag is not-found", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await expect(svc.getTag({ principal: principal(other), tagId })).rejects.toThrow(TagNotFoundError);
  });
});
