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

describe("pruneUnusedTags — authority reaches the write (cross-owner, #755)", () => {
  // `tag.prune` takes NO foreign id (a caller prunes only its OWN library), so it is EXEMPT from the
  // cross-tenant IDOR sweep — it is the ONE E5 authority candidate that sweep cannot reach. The proof that
  // its bulk DELETE carries the caller's authority into the commit is therefore purely the owner scope folded
  // into the statement (persistence/queries.ts::pruneZeroUsageTags): the owner-scoped candidate scan
  // (`listOwnedTagsWithUsage(db, ownerId)`) AND the DELETE's own `ownerId` predicate — defense in depth, each
  // sufficient alone. Drop BOTH (the plausible "consolidate the prune into one global sweep" refactor) and a
  // single user's prune becomes a box-wide zero-usage mass-delete across EVERY owner. This pins the end-to-end
  // owner scope so that regression goes red: owner A's prune leaves owner B's identical zero-usage tag intact.
  test("owner A's prune never deletes owner B's zero-usage tags", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    // Both owners hold an identically-named, zero-usage tag — the exact shape a dropped owner scope conflates.
    await seedTag(db, alice, { id: "tag_alice_dead", name: "dead" });
    const bobTag = await seedTag(db, bob, { id: "tag_bob_dead", name: "dead" });

    const result = await svc.pruneUnusedTags({ principal: principal(alice) });

    expect(result).toStrictEqual({ removed: 1 }); // ONLY Alice's dead tag — never Bob's
    // Bob's tag survives, taken as Bob's own scoped read (a per-owner read is evidence about the asker).
    expect((await svc.listTags({ principal: principal(bob) })).map((t) => t.id)).toEqual([bobTag]);
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
