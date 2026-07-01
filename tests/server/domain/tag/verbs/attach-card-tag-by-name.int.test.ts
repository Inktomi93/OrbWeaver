// verb: attachCardTagByName — the internal resolve-or-create-by-name card-tag attach (character's injected
// AttachCardTagOp). Load-bearing: resolve-or-create is race-safe + owner-scoped (no cross-owner reuse, no
// duplicate tag); the attach is idempotent and reports newly-attached (the boolean bulkAddCardTag counts).

import { characterTags, tags } from "@orb/db";
import { createTagService } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedCharacter, seedTag, seedUser } from "../_support.ts";

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

  test("defaults to source:'manual', status:'accepted' (the unchanged manual-add path)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "hero" });

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows[0]?.source).toBe("manual");
    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction[0]?.status).toBe("accepted");
  });

  test("source:'card' + status:'pending' writes a card-sourced tag staged as a pending suggestion", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    const attached = await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "bard",
      source: "card",
      status: "pending",
    });
    expect(attached).toBe(true);

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows[0]?.name).toBe("bard");
    expect(tagRows[0]?.source).toBe("card");
    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction[0]?.status).toBe("pending");
  });

  test("a re-attach NEVER downgrades an accepted row back to pending (card re-import can't un-accept)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    // The user manual-adds the tag (accepted), then a card re-import re-attaches it as pending.
    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "bard" });
    const reattached = await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "bard",
      source: "card",
      status: "pending",
    });
    expect(reattached).toBe(false); // already attached → a no-op, NOT a downgrade

    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction).toHaveLength(1);
    expect(junction[0]?.status).toBe("accepted"); // still accepted — the no-op left it untouched
    // the tag keeps the source it was born with (manual); a re-attach doesn't restamp source.
    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows[0]?.source).toBe("manual");
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

  test("normalizes whitespace (trim + collapse) before resolve — ' Mentor ' and 'mentor' are ONE tag", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "  Mentor  " });
    await svc.attachCardTagByName({ ownerId: owner, characterId, tagName: "mentor" });

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows).toHaveLength(1);
    // First-write casing + whitespace-collapse is the stored display form.
    expect(tagRows[0]?.name).toBe("Mentor");
    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction).toHaveLength(1);
  });
});

// The unified chokepoint: every SOURCE (manual createTag + card-import attachCardTagByName) canonicalizes the
// name the same way + dedupes on the `(ownerId, lower(name))` functional unique, so a manual "Female" and a
// card "female" collapse onto ONE row — the whole point of this refactor.
describe("cross-source tag dedupe", () => {
  test("'Female' via createTag + 'female' via attachCardTagByName → ONE tag (the second resolves to the first)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    const manual = await svc.createTag({ principal: principal(owner), input: { name: "Female" } });
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "female",
      source: "card",
      status: "pending",
    });

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows).toHaveLength(1);
    expect(tagRows[0]?.id).toBe(manual.id); // the card attach reused the manually-created row
    expect(tagRows[0]?.name).toBe("Female"); // first-write display casing kept

    const junction = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.characterId, characterId));
    expect(junction).toHaveLength(1);
    expect(junction[0]?.tagId).toBe(manual.id);
  });

  test("the `(ownerId, lower(name))` functional unique is enforced — a case-variant createTag is a conflict", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);

    // Seed a card-sourced "female", then a manual create of "FEMALE" must collide on the folded key.
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId,
      tagName: "female",
      source: "card",
    });
    await expect(
      svc.createTag({ principal: principal(owner), input: { name: "FEMALE" } }),
    ).rejects.toThrow();

    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(1);
  });
});
