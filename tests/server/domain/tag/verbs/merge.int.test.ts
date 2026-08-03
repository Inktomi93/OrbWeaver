// verb: mergeTags — fold one owned tag into another. Attachments move across all five junctions, dupes
// collapse (strongest character status survives), the source tag is gone, and a foreign/self merge is
// refused.

import type { TagTargetType } from "@orb/contracts/tag";
import type { Db } from "@orb/db";
import { characterTags, chatTags, personaTags, presetTags, tags, worldBookTags } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { and, eq } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedCharacter, seedChat, seedPersona, seedPreset, seedTag, seedUser, seedWorldBook } from "../_support.ts";

/** How many rows of `table` carry `tagId` on `col` — the junction-count assertion helper. */
async function countTag(db: Db, table: SQLiteTable, col: SQLiteColumn, tagId: TagId): Promise<number> {
  return (await db.select().from(table).where(eq(col, tagId))).length;
}

describe("mergeTags", () => {
  test("re-points attachments across all five junctions and deletes the source", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const source = await seedTag(db, owner, { id: "tag_src", name: "src" });
    const target = await seedTag(db, owner, { id: "tag_dst", name: "dst" });

    const characterId = await seedCharacter(db, owner);
    const worldBookId = await seedWorldBook(db, owner);
    const personaId = await seedPersona(db, owner);
    const presetId = await seedPreset(db, owner);
    const chatId = await seedChat(db);
    h.allowChat(chatId);

    const p = principal(owner);
    const attach = (tagId: TagId, targetType: TagTargetType, targetId: string): Promise<void> => svc.attachTag({ principal: p, tagId, targetType, targetId });
    await attach(source, "character", characterId);
    await attach(source, "worldBook", worldBookId);
    await attach(source, "persona", personaId);
    await attach(source, "preset", presetId);
    await attach(source, "chat", chatId);

    await svc.mergeTags({ principal: p, sourceTagId: source, targetTagId: target });

    // Every junction row now points at the target, none at the source.
    expect(await countTag(db, characterTags, characterTags.tagId, target)).toBe(1);
    expect(await countTag(db, worldBookTags, worldBookTags.tagId, target)).toBe(1);
    expect(await countTag(db, personaTags, personaTags.tagId, target)).toBe(1);
    expect(await countTag(db, presetTags, presetTags.tagId, target)).toBe(1);
    expect(await countTag(db, chatTags, chatTags.tagId, target)).toBe(1);
    expect(await countTag(db, characterTags, characterTags.tagId, source)).toBe(0);
    // The source tag itself is gone; the target survives.
    expect(await db.select().from(tags).where(eq(tags.id, source))).toHaveLength(0);
    expect(await db.select().from(tags).where(eq(tags.id, target))).toHaveLength(1);
  });

  test("collapses a duplicate character attachment, keeping the accepted status", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const source = await seedTag(db, owner, { id: "tag_src", name: "src" });
    const target = await seedTag(db, owner, { id: "tag_dst", name: "dst" });
    const characterId = await seedCharacter(db, owner);
    const p = principal(owner);

    // Source tags the character ACCEPTED; the target already tags it as a PENDING suggestion.
    await svc.attachTag({
      principal: p,
      tagId: source,
      targetType: "character",
      targetId: characterId,
      status: "accepted",
    });
    await svc.attachTag({
      principal: p,
      tagId: target,
      targetType: "character",
      targetId: characterId,
      status: "pending",
    });

    await svc.mergeTags({ principal: p, sourceTagId: source, targetTagId: target });

    // ONE surviving row on the target — and the stronger `accepted` wins over the pending target.
    const rows = await db
      .select()
      .from(characterTags)
      .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, target)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("accepted");
    expect(await countTag(db, characterTags, characterTags.tagId, source)).toBe(0);
  });

  test("collapses duplicate attachments in the status-less junctions", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const source = await seedTag(db, owner, { id: "tag_src", name: "src" });
    const target = await seedTag(db, owner, { id: "tag_dst", name: "dst" });
    const worldBookId = await seedWorldBook(db, owner);
    const p = principal(owner);

    const attach = (tagId: TagId): Promise<void> => svc.attachTag({ principal: p, tagId, targetType: "worldBook", targetId: worldBookId });
    await attach(source);
    await attach(target);

    await svc.mergeTags({ principal: p, sourceTagId: source, targetTagId: target });

    expect(await countTag(db, worldBookTags, worldBookTags.tagId, target)).toBe(1);
    expect(await countTag(db, worldBookTags, worldBookTags.tagId, source)).toBe(0);
  });

  test("refuses a self-merge with a coded operation error", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await expect(svc.mergeTags({ principal: principal(owner), sourceTagId: tagId, targetTagId: tagId })).rejects.toThrow(DomainOperationError);
  });

  test("refuses merging a tag the caller does not own (either endpoint)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db, "user_stranger");
    const svc = createTagService(makeTagHarness(db).ctx);
    const mine = await seedTag(db, owner, { id: "tag_mine", name: "mine" });
    const theirs = await seedTag(db, stranger, { id: "tag_theirs", name: "theirs" });

    // Foreign SOURCE → not-found.
    await expect(svc.mergeTags({ principal: principal(owner), sourceTagId: theirs, targetTagId: mine })).rejects.toThrow(TagNotFoundError);
    // Foreign TARGET → not-found.
    await expect(svc.mergeTags({ principal: principal(owner), sourceTagId: mine, targetTagId: theirs })).rejects.toThrow(TagNotFoundError);
    // The stranger's tag survived untouched.
    expect(await db.select().from(tags).where(eq(tags.id, theirs))).toHaveLength(1);
  });

  test("a missing tag reads as not-found", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const mine = await seedTag(db, owner, { id: "tag_mine", name: "mine" });
    await expect(
      svc.mergeTags({
        principal: principal(owner),
        sourceTagId: mine,
        targetTagId: castId<TagId>("tag_ghost"),
      }),
    ).rejects.toThrow(TagNotFoundError);
  });
});

describe("mergeTags — audit", () => {
  test("a successful merge writes tag.merge with the target in metadata", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const source = await seedTag(db, owner, { id: "tag_src", name: "src" });
    const target = await seedTag(db, owner, { id: "tag_dst", name: "dst" });

    await svc.mergeTags({ principal: principal(owner), sourceTagId: source, targetTagId: target });
    expect(h.audits).toEqual([
      {
        actorUserId: owner,
        action: "tag.merge",
        entityType: "tag",
        entityId: source,
        metadata: { into: target },
      },
    ]);
  });
});
