// verb: pruneUnusedTags — deletes only zero-usage tags; returns the removed count.

import { characterTags } from "@orb/db";
import { createTagService } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedCharacter, seedTag, seedUser } from "../_support.ts";

const TAG_DELETE = /delete from "tags"/iu;

describe("pruneUnusedTags", () => {
  test("removes unused tags, keeps used ones, and reports the count", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const used = await seedTag(db, owner, { id: "tag_used", name: "used" });
    await seedTag(db, owner, { id: "tag_dead", name: "dead" });
    await svc.attachTag({
      principal: principal(owner),
      tagId: used,
      targetType: "character",
      targetId: characterId,
    });

    const result = await svc.pruneUnusedTags({ principal: principal(owner) });
    expect(result).toStrictEqual({ removed: 1 });
    const surviving = (await svc.listTags({ principal: principal(owner) })).map((t) => t.id);
    expect(surviving).toEqual([used]);
  });

  test("an attachment committed after the zero-usage snapshot keeps the tag", async () => {
    const { db, hold } = await freshHeldDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_raced", name: "raced" });
    const deletes = hold(TAG_DELETE);

    const pruning = svc.pruneUnusedTags({ principal: principal(owner) });
    await deletes.reached;
    await svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId: characterId });
    deletes.release();
    const result = await pruning;

    expect(result).toEqual({ removed: 0 });
    expect((await svc.listTags({ principal: principal(owner) })).map((tag) => tag.id)).toContain(tagId);
    expect(await db.select().from(characterTags).where(eq(characterTags.tagId, tagId))).toHaveLength(1);
    expect(h.audits.filter((entry) => entry.action === "tag.prune")).toEqual([]);
  });
});

describe("pruneUnusedTags — audit", () => {
  test("a pruning pass writes ONE tag.prune row with the count; a zero-work pass writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await seedTag(db, owner, { id: "tag_b", name: "beta" });

    const first = await svc.pruneUnusedTags({ principal: principal(owner) });
    expect(first.removed).toBe(2);
    expect(h.audits).toEqual([
      {
        actorUserId: owner,
        action: "tag.prune",
        entityType: "tag",
        entityId: null,
        metadata: { removed: 2 },
      },
    ]);

    // Nothing left to prune — the idempotent zero-work rerun writes no row.
    await svc.pruneUnusedTags({ principal: principal(owner) });
    expect(h.audits).toHaveLength(1);
  });
});
