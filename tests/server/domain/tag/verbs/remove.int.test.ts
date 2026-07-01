// verb: removeTag — owner-scoped delete (NOT idempotent); junction rows cascade.

import { characterTags } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedCharacter, seedTag, seedUser } from "../_support.ts";

describe("removeTag", () => {
  test("removes the tag and cascades its junction rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });

    await svc.removeTag({ principal: principal(owner), tagId });
    expect(
      await db.select().from(characterTags).where(eq(characterTags.tagId, tagId)),
    ).toHaveLength(0);
  });

  test("removing a missing tag is not-found (not idempotent)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await expect(
      svc.removeTag({ principal: principal(owner), tagId: castId<TagId>("tag_ghost") }),
    ).rejects.toThrow(TagNotFoundError);
  });
});
