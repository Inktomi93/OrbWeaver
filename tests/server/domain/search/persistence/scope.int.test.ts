// persistence: scope — the chat-memory scope SQL-fragment builders. Asserts the belts in isolation by
// running a real select with the built condition: the digest candidate restriction matches the full
// `(chatId, scopedCharacterId, tier, blockIdx)` key, the owner belt (via the producer-card JOIN) excludes a
// foreign owner, and the segment candidate restriction matches on `(chatId, blockIdx)`.

import { characters, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import {
  digestScopeCond,
  segmentScopeCond,
} from "../../../../../packages/server/src/domain/search/persistence/scope.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  EMBED_MODEL,
  seedCharacter,
  seedChat,
  seedChatDigest,
  seedChatSegment,
  seedUser,
  vec,
} from "../_support.ts";

describe("digestScopeCond", () => {
  test("the candidate restriction matches the full block key (not just chat+block)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const x = await seedCharacter(db, { id: "character_x", ownerId: owner, name: "X" });
    const y = await seedCharacter(db, { id: "character_y", ownerId: owner, name: "Y" });
    const chat = await seedChat(db, "chat_a");
    // Same (chat, tier, block) for two POVs — only X's must match the X candidate.
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: x,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: y,
      blockIdx: 0,
      embedding: vec(1),
    });

    const cond = digestScopeCond({
      model: EMBED_MODEL,
      chatIds: [chat],
      candidates: [{ chatId: chat, tier: 0, blockIdx: 0, scopedCharacterId: x }],
    });
    const rows = await db
      .select({ scopedCharacterId: chatDigests.scopedCharacterId })
      .from(chatDigests)
      .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
      .where(cond);

    expect(rows.map((r) => r.scopedCharacterId)).toEqual([x]);
  });

  test("the owner belt excludes a foreign owner's digest", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const mine = await seedCharacter(db, { id: "character_mine", ownerId: owner, name: "Mine" });
    const theirs = await seedCharacter(db, {
      id: "character_theirs",
      ownerId: other,
      name: "Theirs",
    });
    const chat = await seedChat(db, "chat_a");
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: mine,
      blockIdx: 0,
      embedding: vec(1),
    });
    await seedChatDigest(db, {
      chatId: chat,
      scopedCharacterId: theirs,
      blockIdx: 1,
      embedding: vec(1),
    });

    const cond = digestScopeCond({ model: EMBED_MODEL, ownerId: owner });
    const rows = await db
      .select({ scopedCharacterId: chatDigests.scopedCharacterId })
      .from(chatDigests)
      .innerJoin(characters, eq(chatDigests.scopedCharacterId, characters.id))
      .where(cond);

    expect(rows.map((r) => r.scopedCharacterId)).toEqual([mine]);
  });
});

describe("segmentScopeCond", () => {
  test("the candidate restriction matches on (chatId, blockIdx)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    await seedCharacter(db, { id: "character_pov", ownerId: owner, name: "POV" });
    const chat = await seedChat(db, "chat_a");
    await seedChatSegment(db, { chatId: chat, blockIdx: 0, embedding: vec(1) });
    await seedChatSegment(db, { chatId: chat, blockIdx: 1, embedding: vec(1) });

    // The segment candidate ignores scopedCharacterId — it keys on (chatId, blockIdx) only.
    const cond = segmentScopeCond({
      model: EMBED_MODEL,
      chatIds: [chat],
      candidates: [
        {
          chatId: chat,
          tier: 0,
          blockIdx: 1,
          scopedCharacterId: castId<CharacterId>("character_pov"),
        },
      ],
    });
    const rows = await db
      .select({ blockIdx: chatSegments.blockIdx })
      .from(chatSegments)
      .where(cond);

    expect(rows.map((r) => r.blockIdx)).toEqual([1]);
  });
});
