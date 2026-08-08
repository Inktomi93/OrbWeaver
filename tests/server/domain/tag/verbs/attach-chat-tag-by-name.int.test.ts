// verb: attachChatTagByName (R6) — the internal resolve-or-create-by-name CHAT-tag attach, the card
// sibling's mirror one junction over. Minted so the orb-native chat bundle can restore its `chat_tags`
// overlay BY NAME (tag ids no more survive a cross-box move than chat ids do), which is what ended the
// registry's ACCEPTED-LOSSY row for that table.
//
// Load-bearing here, and different from the card arm in exactly one way that matters: `chat_tags` is a
// per-TAGGER overlay (D30 — `ownerId` is part of its PK), so "already attached" means already attached BY
// THIS USER, and a co-member's identical label is a different row this verb must leave alone.

import { chatTags, tags } from "@orb/db";
import { createTagService } from "@orb/server/domain/tag";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, seedChat, seedTag, seedUser } from "../_support.ts";

describe("attach chat tag by name", () => {
  test("a brand-new name creates the owner's tag and places the per-tagger overlay row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);

    expect(await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "campaign" })).toBe(true);

    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows.map((t) => t.name)).toEqual(["campaign"]);
    const junction = await db.select().from(chatTags).where(eq(chatTags.chatId, chatId));
    expect(junction).toHaveLength(1);
    expect(junction[0]?.tagId).toBe(tagRows[0]?.id);
    expect(junction[0]?.ownerId).toBe(owner);
  });

  test("an existing name is REUSED — a restored bundle folds onto the label the library already holds", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);
    const existing = await seedTag(db, owner, { id: "tag_campaign", name: "campaign" });

    await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "campaign" });

    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(1);
    const junction = await db.select().from(chatTags).where(eq(chatTags.chatId, chatId));
    expect(junction[0]?.tagId).toBe(existing);
  });

  test("re-attaching is idempotent — a re-imported bundle writes no second overlay row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);

    await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "campaign" });
    await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "campaign" });

    expect(await db.select().from(chatTags).where(eq(chatTags.chatId, chatId))).toHaveLength(1);
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(1);
  });

  test("D30: a SECOND tagger's identical label is its own row, and the first tagger's is untouched", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const other = await seedUser(db, "user_second_tagger");
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);

    await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "campaign" });
    await svc.attachChatTagByName({ ownerId: other, chatId, tagName: "campaign" });

    const mine = await db
      .select()
      .from(chatTags)
      .where(and(eq(chatTags.chatId, chatId), eq(chatTags.ownerId, owner)));
    const theirs = await db
      .select()
      .from(chatTags)
      .where(and(eq(chatTags.chatId, chatId), eq(chatTags.ownerId, other)));
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    // Two OWNERS, two tag rows — a label is personal, so the second tagger got their own.
    expect(mine[0]?.tagId).not.toBe(theirs[0]?.tagId);
  });

  test("a blank name is a no-op — no tag minted, no overlay row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);

    expect(await svc.attachChatTagByName({ ownerId: owner, chatId, tagName: "   " })).toBe(false);
    expect(await db.select().from(tags).where(eq(tags.ownerId, owner))).toHaveLength(0);
    expect(await db.select().from(chatTags).where(eq(chatTags.chatId, chatId))).toHaveLength(0);
  });
});
