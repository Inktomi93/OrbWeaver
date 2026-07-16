// verb: detachCardTagByName — the internal resolve-BY-NAME card-tag detach (character's injected
// DetachCardTagOp), the mirror of attachCardTagByName. Load-bearing: resolve-by-name is owner-scoped (a
// foreign owner's same-name tag is NOT touched), removes EXACTLY the one junction row, and is idempotent on an
// absent tag / already-detached junction (returns false, never throws, never mints a tag).

import { characterTags, tags } from "@orb/db";
import { createTagService } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, seedCharacter, seedTag, seedUser } from "../_support.ts";

describe("detach card tag by name", () => {
  test("removes EXACTLY the one junction row and reports removed; the tag row survives", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    // Attach two tags, then detach one — only that junction goes; the tag itself + the sibling junction stay.
    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });
    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "villain" });

    const removed = await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });
    expect(removed).toBe(true);

    const junction = await db.select().from(characterTags).where(eq(characterTags.characterId, characterId));
    expect(junction).toHaveLength(1);
    // The surviving junction is "villain"; "hero" is gone.
    const survivingTagId = junction[0]?.tagId;
    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    const heroTag = tagRows.find((t) => t.name === "hero");
    const villainTag = tagRows.find((t) => t.name === "villain");
    expect(survivingTagId).toBe(villainTag?.id);
    // The detached tag's ROW survives (an orphaned tag is prune-unused's concern, not a detach's).
    expect(heroTag).toBeDefined();
    expect(tagRows).toHaveLength(2);
  });

  test("idempotent on an ABSENT tag: the owner has no such tag → returns false, no throw", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    const removed = await svc.detachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "ghost",
    });
    expect(removed).toBe(false);
    // No tag was minted by the failed resolve.
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(0);
  });

  test("idempotent on an already-detached junction: tag exists but the character doesn't carry it → false", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    // The tag exists but was never attached to THIS character.
    await seedTag(db, owner, { id: "tag_hero", name: "hero" });

    const first = await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });
    expect(first).toBe(false);

    // Attach then detach twice — the second detach is a no-op.
    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });
    expect(await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "hero" })).toBe(true);
    expect(await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "hero" })).toBe(false);
    expect(await db.select().from(characterTags).where(eq(characterTags.characterId, characterId))).toHaveLength(0);
  });

  test("owner-scoping: a DIFFERENT owner's same-name tag/junction is NOT removed", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const ownCharacter = await seedCharacter(db, owner, "character_mine");
    const foreignCharacter = await seedCharacter(db, other, "character_theirs");

    // Both owners tag their own character "hero".
    await svc.attachCardTagByName({ ownerId: owner, characterId: ownCharacter, tagName: "hero" });
    await svc.attachCardTagByName({
      ownerId: other,
      characterId: foreignCharacter,
      tagName: "hero",
    });

    // `owner` detaches "hero" — resolves ONLY the owner's tag; the foreign owner's junction is untouched.
    const removed = await svc.detachCardTagByName({
      ownerId: owner,
      characterId: ownCharacter,
      tagName: "hero",
    });
    expect(removed).toBe(true);

    expect(await db.select().from(characterTags).where(eq(characterTags.characterId, ownCharacter))).toHaveLength(0);
    // The foreign owner's "hero" junction survives (owner-scoped resolve never reached their tag).
    expect(await db.select().from(characterTags).where(eq(characterTags.characterId, foreignCharacter))).toHaveLength(1);
  });

  test("normalizes whitespace + case before resolve — ' HERO ' detaches the 'hero' junction", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });
    const removed = await svc.detachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "  HERO  ",
    });
    expect(removed).toBe(true);
    expect(await db.select().from(characterTags).where(eq(characterTags.characterId, characterId))).toHaveLength(0);
  });

  test("a blank name is a no-op (returns false)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    expect(await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "   " })).toBe(false);
  });
});

describe("detach card tag by name — audit", () => {
  test("an actual removal writes tag.detachByName; a no-op detach writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);

    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "Mentor" });
    const auditsBefore = h.audits.length;

    const removed = await svc.detachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "mentor",
    });
    expect(removed).toBe(true);
    expect(h.audits).toHaveLength(auditsBefore + 1);
    // The audit records the normalized REQUESTED name (what the caller asked to detach), mirroring the
    // attach path — not a re-read of the stored display casing.
    expect(h.audits.at(-1)).toMatchObject({
      actorUserId: owner,
      action: "tag.detachByName",
      entityType: "tag",
      metadata: { characterId, name: "mentor" },
    });

    // A repeat detach is an already-absent no-op — no audit spam.
    const again = await svc.detachCardTagByName({ ownerId: owner, characterId, tagName: "mentor" });
    expect(again).toBe(false);
    expect(h.audits).toHaveLength(auditsBefore + 1);
  });
});
