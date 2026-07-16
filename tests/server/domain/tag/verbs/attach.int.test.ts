// verbs: attachTag · detachTag · bulkAttachTag — ownership + target gate + the D30 chat membership overlay +
// the proposed/accepted status lifecycle, all through the service front door.

import { characterTags, chatTags } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTagService, TagNotFoundError } from "@orb/server/domain/tag";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedCharacter, seedChat, seedTag, seedUser } from "../_support.ts";

describe("attachTag / detachTag / bulkAttachTag", () => {
  test("attaching to an owned character defaults to accepted; passing pending then re-attaching flips it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
      status: "pending",
    });
    let rows = await db.select().from(characterTags).where(eq(characterTags.tagId, tagId));
    expect(rows[0]?.status).toBe("pending");

    // the user's "Accept" (default status) flips the same row.
    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    rows = await db.select().from(characterTags).where(eq(characterTags.tagId, tagId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("accepted");
  });

  test("detach removes the junction row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });

    await svc.detachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    expect(await db.select().from(characterTags).where(eq(characterTags.tagId, tagId))).toHaveLength(0);
  });

  test("attaching a tag you do not own is tag-not-found (the tag guard fires first)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner, "character_mine");
    const foreignTag = await seedTag(db, other, { id: "tag_theirs", name: "theirs" });

    await expect(
      svc.attachTag({
        principal: principal(owner),
        tagId: foreignTag,
        targetType: "character",
        targetId: characterId,
      }),
    ).rejects.toThrow(TagNotFoundError);
  });

  test("attaching to a foreign target is target-not-found", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const foreign = await seedCharacter(db, other, "character_foreign");
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await expect(
      svc.attachTag({
        principal: principal(owner),
        tagId,
        targetType: "character",
        targetId: foreign,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("a chat attach is allowed for a participant and the junction carries the tagger's ownerId (D30)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const chatId = await seedChat(db);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    h.allowChat(chatId);

    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "chat",
      targetId: chatId,
    });
    const rows = await db.select().from(chatTags).where(eq(chatTags.tagId, tagId));
    expect(rows[0]?.ownerId).toBe(owner);
  });

  test("a chat attach is denied for a non-participant", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const chatId = await seedChat(db);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await expect(svc.attachTag({ principal: principal(owner), tagId, targetType: "chat", targetId: chatId })).rejects.toThrow(DomainForbiddenError);
    expect(await db.select().from(chatTags).where(eq(chatTags.tagId, tagId))).toHaveLength(0);
  });

  test("bulkAttachTag attaches all owned tags; a non-owned id in the set is not-found (no partial write)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const a = await seedTag(db, owner, { id: "tag_a", name: "a" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "b" });

    await svc.bulkAttachTag({
      principal: principal(owner),
      tagIds: [a, b],
      targetType: "character",
      targetId: characterId,
    });
    expect(await db.select().from(characterTags).where(eq(characterTags.characterId, characterId))).toHaveLength(2);

    await expect(
      svc.bulkAttachTag({
        principal: principal(owner),
        tagIds: [a, castId<TagId>("tag_ghost")],
        targetType: "character",
        targetId: characterId,
      }),
    ).rejects.toThrow(TagNotFoundError);
  });
});

describe("junction trio — audit", () => {
  test("attach/detach/bulkAttach each write their row; a denied/not-found op writes nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const tagB = await seedTag(db, owner, { id: "tag_b", name: "beta" });

    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    await svc.detachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    await svc.bulkAttachTag({
      principal: principal(owner),
      tagIds: [tagId, tagB],
      targetType: "character",
      targetId: characterId,
    });

    expect(h.audits).toEqual([
      {
        actorUserId: owner,
        action: "tag.attach",
        entityType: "tag",
        entityId: tagId,
        metadata: { targetType: "character", targetId: characterId, status: "accepted" },
      },
      {
        actorUserId: owner,
        action: "tag.detach",
        entityType: "tag",
        entityId: tagId,
        metadata: { targetType: "character", targetId: characterId },
      },
      {
        actorUserId: owner,
        action: "tag.bulkAttach",
        entityType: "tag",
        entityId: null,
        metadata: {
          targetType: "character",
          targetId: characterId,
          tagIds: [tagId, tagB],
          status: "accepted",
        },
      },
    ]);

    // A foreign/missing tag throws BEFORE any junction write — no phantom audit row.
    await svc
      .attachTag({
        principal: principal(owner),
        tagId: castId<TagId>("tag_ghost"),
        targetType: "character",
        targetId: characterId,
      })
      .catch((e: unknown) => e);
    expect(h.audits).toHaveLength(3);
  });
});
