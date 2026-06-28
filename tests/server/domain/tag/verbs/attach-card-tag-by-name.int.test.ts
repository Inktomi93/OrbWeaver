// verb: attachCardTagByName — the internal resolve-or-create-by-name card-tag attach (character's injected
// AttachCardTagOp). Load-bearing: resolve-or-create is race-safe + owner-scoped (no cross-owner reuse, no
// duplicate tag); the attach is idempotent and reports newly-attached (the boolean bulkAddCardTag counts).

import { characterTags, tags } from "@orb/db";
import { createTagService } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeTagHarness, seedCharacter, seedTag, seedUser } from "../_support.ts";

describe("attach card tag by name", () => {
  test("a brand-new name creates the owner's tag, attaches it accepted, and reports newly-attached", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    const attached = await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "hero",
    });
    expect(attached).toBe(true);

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows.map((t) => t.name)).toEqual(["hero"]);

    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction).toHaveLength(1);
    expect(junction[0]?.tagId).toBe(tagRows[0]?.id);
    expect(junction[0]?.status).toBe("accepted");
  });

  test("an existing name is REUSED (no duplicate tag) and attached", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const existing = await seedTag(db, owner, { id: "tag_hero", name: "hero" });

    const attached = await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "hero",
    });
    expect(attached).toBe(true);

    // Reused the existing row — no second "hero" tag minted.
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(1);
    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction[0]?.tagId).toBe(existing);
  });

  test("re-attaching the same tag/character is an idempotent no-op (returns false, no duplicate rows)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    expect(await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" })).toBe(
      true,
    );
    expect(await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" })).toBe(
      false,
    );

    expect(
      await db.select().from(characterTags).where(eq(characterTags.characterId, characterId)),
    ).toHaveLength(1);
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(1);
  });

  test("owner-scoping: a different owner's same-name tag is NOT reused (a fresh owner-scoped tag is minted)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner, "character_mine");
    const foreignTag = await seedTag(db, other, { id: "tag_theirs", name: "hero" });

    const attached = await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "hero",
    });
    expect(attached).toBe(true);

    // The owner gets their OWN "hero" tag — distinct id from the foreign one (no cross-tenant reuse).
    const ownerTags = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(ownerTags).toHaveLength(1);
    expect(ownerTags[0]?.id).not.toBe(foreignTag);
    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction[0]?.tagId).toBe(ownerTags[0]?.id);
  });

  test("a blank name is a no-op (returns false, no tag minted)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    expect(await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "   " })).toBe(
      false,
    );
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(0);
  });
});
