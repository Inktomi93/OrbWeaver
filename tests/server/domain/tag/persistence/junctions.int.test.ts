// persistence/junctions — the polymorphic dispatch + the D30 scoping flavors against a real db. Covers:
// target-derived ownership gate (owned passes / foreign 404), the injected chat membership gate (allow/deny +
// it is actually consulted), the character proposed→accepted status UPSERT (the "Accept" flip), the chat
// per-user overlay (own-row-only delete), and bulk attach.

import { characterTags, chatTags } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  bulkInsertJunctionRows,
  deleteJunctionRow,
  ensureTargetAccessible,
  insertJunctionRow,
} from "../../../../../packages/server/src/domain/tag/persistence/junctions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedCharacter, seedChat, seedTag, seedUser } from "../_support.ts";

describe("tag persistence/junctions", () => {
  test("ensureTargetAccessible passes an owned target and 404s a foreign one", async () => {
    const db = await freshDb();
    const h = makeTagHarness(db);
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const mine = await seedCharacter(db, owner, "character_mine");
    const theirs = await seedCharacter(db, other, "character_theirs");

    await expect(
      ensureTargetAccessible({
        db,
        principal: principal(owner),
        requireParticipant: h.ctx.requireParticipant,
        targetType: "character",
        targetId: mine,
      }),
    ).resolves.toBeUndefined();
    await expect(
      ensureTargetAccessible({
        db,
        principal: principal(owner),
        requireParticipant: h.ctx.requireParticipant,
        targetType: "character",
        targetId: theirs,
      }),
    ).rejects.toThrow(DomainNotFoundError);
  });

  test("a chat target routes through the injected membership gate (allow vs deny)", async () => {
    const db = await freshDb();
    const h = makeTagHarness(db);
    const owner = await seedUser(db);
    const memberChat = await seedChat(db, "chat_member");
    const otherChat = await seedChat(db, "chat_stranger");
    h.allowChat(memberChat);

    await expect(
      ensureTargetAccessible({
        db,
        principal: principal(owner),
        requireParticipant: h.ctx.requireParticipant,
        targetType: "chat",
        targetId: memberChat,
      }),
    ).resolves.toBeUndefined();
    await expect(
      ensureTargetAccessible({
        db,
        principal: principal(owner),
        requireParticipant: h.ctx.requireParticipant,
        targetType: "chat",
        targetId: otherChat,
      }),
    ).rejects.toThrow(DomainForbiddenError);
    // The gate was actually consulted for both chats (membership, never owner-equality).
    expect(h.participantChecks).toEqual([memberChat, otherChat]);
  });

  test("a character attach UPSERTs status: pending suggestion → accepted on re-attach (the Accept flip)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    await insertJunctionRow({
      db,
      targetType: "character",
      targetId: characterId,
      tagId,
      taggerId: owner,
      status: "pending",
    });
    const pending = await db
      .select()
      .from(characterTags)
      .where(and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)));
    expect(pending[0]?.status).toBe("pending");

    await insertJunctionRow({
      db,
      targetType: "character",
      targetId: characterId,
      tagId,
      taggerId: owner,
      status: "accepted",
    });
    const accepted = await db.select().from(characterTags).where(eq(characterTags.tagId, tagId));
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.status).toBe("accepted");
  });

  test("a chat attach stamps the tagger's ownerId, and detach removes only that tagger's overlay row (D30)", async () => {
    const db = await freshDb();
    const tagger = await seedUser(db, "user_tagger");
    const otherTagger = await seedUser(db, "user_other");
    const chatId = await seedChat(db);
    const tagId = await seedTag(db, tagger, { id: "tag_a", name: "alpha" });

    // Two coexisting overlay rows for the same (chat, tag) pair — distinct taggers (D30 per-user overlay).
    await insertJunctionRow({
      db,
      targetType: "chat",
      targetId: chatId,
      tagId,
      taggerId: tagger,
      status: "accepted",
    });
    await insertJunctionRow({
      db,
      targetType: "chat",
      targetId: chatId,
      tagId,
      taggerId: otherTagger,
      status: "accepted",
    });
    expect(await db.select().from(chatTags).where(eq(chatTags.tagId, tagId))).toHaveLength(2);

    await deleteJunctionRow({ db, targetType: "chat", targetId: chatId, tagId, taggerId: tagger });
    const remaining = await db.select().from(chatTags).where(eq(chatTags.tagId, tagId));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.ownerId).toBe(otherTagger);
  });

  test("bulkInsertJunctionRows attaches many tags to one target in one call", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const characterId = await seedCharacter(db, owner);
    const a = await seedTag(db, owner, { id: "tag_a", name: "a" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "b" });

    await bulkInsertJunctionRows({
      db,
      targetType: "character",
      targetId: characterId,
      tagIds: [a, b],
      taggerId: owner,
      status: "accepted",
    });
    const rows = await db.select().from(characterTags).where(eq(characterTags.characterId, characterId));
    expect(rows.map((r) => r.tagId).sort()).toEqual([a, b].sort());
  });

  test("a missing-character attach fails on the FK (the registry is the only insertion path)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await expect(
      insertJunctionRow({
        db,
        targetType: "character",
        targetId: castId<CharacterId>("character_ghost"),
        tagId,
        taggerId: owner,
        status: "accepted",
      }),
    ).rejects.toThrow();
  });
});
