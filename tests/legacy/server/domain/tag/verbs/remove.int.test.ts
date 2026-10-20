// verb: removeTag — owner-scoped delete (NOT idempotent); junction rows cascade.
// @subject packages/server/src/domain/tag/verbs/remove.ts

import { characterTags } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createTagService, TagNotFoundError } from "#server/domain/tag/index.ts";
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
      principal: await principal(db, owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });

    await svc.removeTag({ principal: await principal(db, owner), tagId });
    expect(await db.select().from(characterTags).where(eq(characterTags.tagId, tagId))).toHaveLength(0);
  });

  test("removing a missing tag is not-found (not idempotent)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    await expect(svc.removeTag({ principal: await principal(db, owner), tagId: castId<TagId>("tag_ghost") })).rejects.toThrow(TagNotFoundError);
  });
});

describe("removeTag — audit", () => {
  test("a successful remove writes tag.remove; a not-found throw writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await svc.removeTag({ principal: await principal(db, owner), tagId });
    expect(h.audits).toEqual([{ actorUserId: owner, action: "tag.remove", entityType: "tag", entityId: tagId }]);

    await svc.removeTag({ principal: await principal(db, owner), tagId }).catch((e: unknown) => e);
    expect(h.audits).toHaveLength(1);
  });
});
