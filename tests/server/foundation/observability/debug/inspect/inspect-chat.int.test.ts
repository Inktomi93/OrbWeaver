// foundation/observability/debug/inspect/inspect-chat — the deep per-chat state dump against a real libSQL
// :memory: db (FK enforcement ON, via freshDb). Asserts the flatten across joins: the chat row, the roster
// (human XOR character, with the character's resolved name via the leftJoin), each message slot flattened
// with its SELECTED variant's content/provenance (D26), the session-cache frame count (keyed by chatId,
// D8/D25), and recent events (newest-first). Plus the NOT_FOUND short-circuit for an unknown chat.

import { characters, chatEvents, chatParticipants, chats, messages, messageVariants, sessionEntries, users } from "@orb/db";
import type { CharacterId, ChatEventId, ChatId, ChatParticipantId, Handle, MessageId, MessageVariantId, SessionEntryId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { inspectChatState } from "@orb/server/foundation/observability/debug";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../../support/db";
import { expect, test } from "../../../../../support/fixtures";

const SEEDED_THROUGH_SEQ = 4;
const CANON_HASH = "canon-hash-inspect";

interface Seeded {
  chatId: ChatId;
  userId: UserId;
  characterId: CharacterId;
  messageId: MessageId;
  variantId: MessageVariantId;
}

// Seed a chat with one human + one character roster member, one message slot pointing at its variant
// (D26 circular-FK dance), one session-cache frame, and two bus events. The inspection should flatten all
// of it into one structure.
async function seedFullChat(db: Awaited<ReturnType<typeof freshDb>>): Promise<Seeded> {
  const userId = castId<UserId>("user_inspect");
  await db.insert(users).values({ id: userId, handle: castId<Handle>("user_inspect") });

  const characterId = castId<CharacterId>("character_inspect");
  await db.insert(characters).values({
    id: characterId,
    handle: "card-inspect",
    ownerId: userId,
    contentHash: "hash-inspect",
    name: "Aria",
  });

  const chatId = castId<ChatId>("chat_inspect");
  await db.insert(chats).values({ id: chatId });

  await db.insert(chatParticipants).values([
    {
      id: castId<ChatParticipantId>("chat_participant_inspect_human"),
      chatId,
      kind: "human",
      userId,
      role: "host",
      joinSeq: 0,
    },
    {
      id: castId<ChatParticipantId>("chat_participant_inspect_char"),
      chatId,
      kind: "character",
      characterId,
      role: "member",
      joinSeq: 1,
    },
  ]);

  const messageId = castId<MessageId>("message_inspect");
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant", characterId });
  const variantId = castId<MessageVariantId>("message_variant_inspect");
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: "Hello from Aria",
    model: "anthropic/claude-opus-4",
    provider: "openrouter",
  });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));

  await db.insert(sessionEntries).values({
    id: castId<SessionEntryId>("session_entry_inspect"),
    chatId,
    sdkSessionId: "sdk-inspect",
    seq: 0,
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });

  await db.insert(chatEvents).values([
    {
      id: castId<ChatEventId>("chat_event_inspect_1"),
      chatId,
      seq: 1,
      type: "chatCreated",
      payload: { type: "chatCreated", chatId },
    },
    {
      id: castId<ChatEventId>("chat_event_inspect_2"),
      chatId,
      seq: 2,
      type: "chatCreated",
      payload: { type: "chatCreated", chatId },
    },
  ]);

  return { chatId, userId, characterId, messageId, variantId };
}

test("inspectChatState flattens the full chat state across the joins", async () => {
  const db = await freshDb();
  const seeded = await seedFullChat(db);

  const report = await inspectChatState(db, seeded.chatId);

  expect(report.found).toBe(true);
  expect(report.chat?.id).toBe(seeded.chatId);

  // Roster: human (userId set, no character name) + character (characterId + resolved name via leftJoin).
  expect(report.participants).toHaveLength(2);
  const human = report.participants.find((p) => p.kind === "human");
  expect(human?.userId).toBe(seeded.userId);
  expect(human?.characterId).toBeNull();
  expect(human?.characterName).toBeNull();
  const character = report.participants.find((p) => p.kind === "character");
  expect(character?.characterId).toBe(seeded.characterId);
  expect(character?.characterName).toBe("Aria");

  // Message slot flattened with its SELECTED variant's content + provenance (D26).
  expect(report.messages).toHaveLength(1);
  const msg = report.messages[0];
  expect(msg?.id).toBe(seeded.messageId);
  expect(msg?.selectedVariantId).toBe(seeded.variantId);
  expect(msg?.content).toBe("Hello from Aria");
  expect(msg?.model).toBe("anthropic/claude-opus-4");
  expect(msg?.provider).toBe("openrouter");
  expect(msg?.excludedFromPrompt).toBe(false);

  // The session-cache frame count (keyed by chatId, NOT a chats.sessionId).
  expect(report.sessionFrameCount).toBe(1);

  // Recent events come back newest-first (desc by seq).
  expect(report.recentEvents.map((e) => e.seq)).toEqual([2, 1]);
});

test("a slot with NO selected variant flattens to null content (the leftJoin miss)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_inspect_novariant");
  await db.insert(chats).values({ id: chatId });
  const messageId = castId<MessageId>("message_inspect_novariant");
  // A born slot before its first variant lands — selectedVariantId is null, so the join yields no content.
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "user" });

  const report = await inspectChatState(db, chatId);
  expect(report.found).toBe(true);
  expect(report.messages).toHaveLength(1);
  expect(report.messages[0]?.selectedVariantId).toBeNull();
  expect(report.messages[0]?.content).toBeNull();
  expect(report.messages[0]?.model).toBeNull();
  expect(report.sessionFrameCount).toBe(0);
});

test("an unknown chat short-circuits to the NOT_FOUND shape", async () => {
  const db = await freshDb();
  const report = await inspectChatState(db, castId<ChatId>("chat_does_not_exist"));
  expect(report.found).toBe(false);
  expect(report.chat).toBeNull();
  expect(report.participants).toEqual([]);
  expect(report.messages).toEqual([]);
  expect(report.sessionFrameCount).toBe(0);
  expect(report.recentEvents).toEqual([]);
});
