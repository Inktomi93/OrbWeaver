// foundation/observability/debug/inspect/list — the id-discovery LIST probes against a real libSQL
// :memory: db. Asserts chatListSummaries returns a row per chat with its participant + message counts
// (grouped, not N+1) newest-updated first, and characterListSummaries returns user-facing characters
// (synthetic excluded) newest-created first.

import { characters, chatParticipants, chats, messages, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { CharacterHandle, CharacterId, ChatId, ChatParticipantId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { characterListSummaries, chatListSummaries } from "@orb/server/foundation/observability/debug";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

test("chatListSummaries returns a row per chat with participant + message counts, newest-updated first", async () => {
  const db = await freshDb();
  const userId = castId<UserId>("user_list");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("user_list"), handleKey: handleKey(castId<Handle>("user_list")) });

  const olderId = castId<ChatId>("chat_list_older");
  const newerId = castId<ChatId>("chat_list_newer");
  await db.insert(chats).values({ id: olderId, title: "Older", updatedAt: 1000 });
  await db.insert(chats).values({ id: newerId, title: "Newer", updatedAt: 2000 });

  const characterId = castId<CharacterId>("character_for_chat_list");
  await db.insert(characters).values({ id: characterId, handle: castId<CharacterHandle>("card-for-chat"), ownerId: userId, contentHash: "h-c", name: "Cast" });
  await db.insert(chatParticipants).values([
    { id: castId<ChatParticipantId>("cp_list_1"), chatId: newerId, kind: "human", userId, role: "host", joinSeq: 0 },
    { id: castId<ChatParticipantId>("cp_list_2"), chatId: newerId, kind: "character", characterId, role: "member", joinSeq: 1 },
  ]);
  await db.insert(messages).values([
    { id: castId<MessageId>("msg_list_1"), chatId: newerId, seq: 1, role: "user", authorUserId: userId },
    { id: castId<MessageId>("msg_list_2"), chatId: newerId, seq: 2, role: "user", authorUserId: userId },
    { id: castId<MessageId>("msg_list_3"), chatId: newerId, seq: 3, role: "user", authorUserId: userId },
  ]);

  const rows = await chatListSummaries(db);
  expect(rows.map((r) => r.id)).toEqual([newerId, olderId]);
  const newer = rows[0];
  expect(newer?.title).toBe("Newer");
  expect(newer?.participantCount).toBe(2);
  expect(newer?.messageCount).toBe(3);
  // A chat with no participants/messages reports zero (the Map fallback), not undefined/missing.
  const older = rows[1];
  expect(older?.participantCount).toBe(0);
  expect(older?.messageCount).toBe(0);
});

test("characterListSummaries returns user-facing characters newest-created first, synthetic excluded", async () => {
  const db = await freshDb();
  const userId = castId<UserId>("user_char_list");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("user_char_list"), handleKey: handleKey(castId<Handle>("user_char_list")) });

  await db.insert(characters).values([
    {
      id: castId<CharacterId>("character_list_a"),
      handle: castId<CharacterHandle>("card-a"),
      ownerId: userId,
      contentHash: "h-a",
      name: "Aria",
      createdAt: 1000,
    },
    {
      id: castId<CharacterId>("character_list_b"),
      handle: castId<CharacterHandle>("card-b"),
      ownerId: userId,
      contentHash: "h-b",
      name: "Bram",
      createdAt: 2000,
    },
    // The hidden per-room group-memory identity — must be filtered from a user-facing list.
    {
      id: castId<CharacterId>("character_list_synth"),
      handle: castId<CharacterHandle>("__group__x"),
      ownerId: userId,
      contentHash: "h-s",
      name: "Group",
      synthetic: true,
      createdAt: 3000,
    },
  ]);

  const rows = await characterListSummaries(db);
  expect(rows.map((r) => r.name)).toEqual(["Bram", "Aria"]);
  expect(rows.map((r) => r.id)).not.toContain(castId<CharacterId>("character_list_synth"));
  expect(rows[0]?.handle).toBe("card-b");
});

test("an empty db lists nothing (no fabricated rows)", async () => {
  const db = await freshDb();
  expect(await chatListSummaries(db)).toEqual([]);
  expect(await characterListSummaries(db)).toEqual([]);
});

test("chatListSummaries counts are per-chat — a second chat's rows don't bleed", async () => {
  const db = await freshDb();
  const userId = castId<UserId>("user_bleed");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("user_bleed"), handleKey: handleKey(castId<Handle>("user_bleed")) });
  const a = castId<ChatId>("chat_bleed_a");
  const b = castId<ChatId>("chat_bleed_b");
  await db.insert(chats).values([
    { id: a, title: "A", updatedAt: 1 },
    { id: b, title: "B", updatedAt: 2 },
  ]);
  await db.insert(messages).values([{ id: castId<MessageId>("msg_bleed_a"), chatId: a, seq: 1, role: "user", authorUserId: userId }]);

  const rows = await chatListSummaries(db);
  const rowA = rows.find((r) => r.id === a);
  const rowB = rows.find((r) => r.id === b);
  expect(rowA?.messageCount).toBe(1);
  expect(rowB?.messageCount).toBe(0);
});
