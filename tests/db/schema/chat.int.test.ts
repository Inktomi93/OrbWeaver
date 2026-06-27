// .int tests for schema/chat — the chat cluster (D16/D18/D25/D26/D27/D28). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: the message SLOT ↔ variant relationship (selectedVariantId pointer, the
// circular-FK insert dance, swipe repoint — D26); the chat_participants actor XOR CHECK (both/neither
// rejected) + the (chatId,userId) UNIQUE (humans dedup, characters coexist); the fork self-FK (parentChatId
// SET NULL on parent delete — D27); invites (status enum + CHECK, token stored HASHED never raw); the
// chats.metadata JSON round-trip via the @orb/db/kit read seam; every enum test-mirror (db column ===
// canonical tuple); chat_events type CHECK over the ChatBusEvent discriminant; and the chat-children
// CASCADE on chat delete (all ten dependents vanish).

import type { OpeningPolicy } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  INVITE_STATUSES,
  JOIN_HISTORY_VISIBILITIES,
  PARTICIPANT_KINDS,
  PARTICIPANT_ROLES,
} from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import {
  characters,
  chatEvents,
  chatInjections,
  chatInvites,
  chatLocks,
  chatParticipants,
  chatStreamEvents,
  chats,
  isConstraintViolation,
  messages,
  messageVariants,
  pendingTurns,
  users,
} from "@orb/db";
import { parseRecord } from "@orb/db/kit";
import type {
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  Handle,
  MessageId,
  MessageVariantId,
  PendingTurnId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// A fixed clock value (epoch-ms number) for caller-set timestamps — deterministic, no ambient clock.
const T0 = 1_700_000_000_000;

async function seedUser(db: Db, raw: string): Promise<UserId> {
  const id = castId<UserId>(raw);
  await db.insert(users).values({ id, handle: castId<Handle>(raw) });
  return id;
}

async function seedCharacter(db: Db, ownerId: UserId, raw: string): Promise<CharacterId> {
  const id = castId<CharacterId>(raw);
  await db
    .insert(characters)
    .values({ id, handle: `card-${raw}`, ownerId, contentHash: `hash-${raw}`, name: raw });
  return id;
}

async function seedChat(db: Db, raw: string): Promise<ChatId> {
  const id = castId<ChatId>(raw);
  await db.insert(chats).values({ id });
  return id;
}

/** The D26 insert dance: a slot is born WITHOUT a selected variant (the circular FK is null-broken), the
 *  variant is inserted, then the slot's pointer is set. Returns the slot + variant ids. */
async function seedMessageWithVariant(
  db: Db,
  o: { chatId: ChatId; rawMsg: string; rawVar: string; content: string; seq: number },
): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const messageId = castId<MessageId>(o.rawMsg);
  const variantId = castId<MessageVariantId>(o.rawVar);
  await db
    .insert(messages)
    .values({ id: messageId, chatId: o.chatId, seq: o.seq, role: "assistant" });
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: o.content });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  return { messageId, variantId };
}

// ── chats ──────────────────────────────────────────────────────────────────

test("chats insert→select round-trips (defaults; NO ownerId — D18)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_rt");

  const rows = await db.select().from(chats).where(eq(chats.id, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(chatId);
  expect(row?.star).toBe(false);
  expect(row?.archived).toBe(false);
  expect(row?.anchorPersonaId).toBeNull();
  expect(row?.parentChatId).toBeNull();
  expect(row?.compactSummary).toBeNull();
  expect(row?.metadata).toBeNull();
  // Timestamps are epoch-ms NUMBERS (never Date) — born at insert.
  expect(row?.createdAt).toBeTypeOf("number");
  expect(row?.updatedAt).toBeTypeOf("number");
});

test("chats.metadata JSON round-trips through the @orb/db/kit read seam", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_meta");
  // A fully-typed metadata blob (group = the fully-defaulted contract default; roomOverrides + opening
  // exercise the other two sub-blobs). The column composes GroupConfig/RoomOverrides/OpeningPolicy.
  const metadata = {
    group: DEFAULT_GROUP_CONFIG,
    roomOverrides: { scenario: "a quiet room" },
    opening: "greet-all" as OpeningPolicy,
  };
  await db.insert(chats).values({ id: chatId, metadata });

  const row = (await db.select().from(chats).where(eq(chats.id, chatId)))[0];
  // The typed read (drizzle hands back the parsed object as-is).
  expect(row?.metadata).toEqual(metadata);
  // The generic read-seam parser (the §8.4 parse-at-the-DB-seam model) round-trips it as a Record.
  const parsed = parseRecord(row?.metadata);
  expect(parsed).toEqual(metadata);
});

test("chats variableValues (read-seam map) + import provenance round-trip", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_vars");
  // The per-chat ChoiceBlock variable flush (setVariables writes it; getStoredVariables reads it).
  const variableValues = { a: "1" };
  await db.insert(chats).values({
    id: chatId,
    variableValues,
    importedFrom: "session-2026.jsonl",
    importHash: "sha256-of-import-bytes",
  });

  const row = (await db.select().from(chats).where(eq(chats.id, chatId)))[0];
  // The typed read (drizzle hands back the parsed object as-is) + the generic read-seam parser.
  expect(row?.variableValues).toEqual(variableValues);
  expect(parseRecord(row?.variableValues)).toEqual(variableValues);
  expect(row?.importedFrom).toBe("session-2026.jsonl");
  expect(row?.importHash).toBe("sha256-of-import-bytes");
});

// ── messages ↔ message_variants (D26) ────────────────────────────────────────

test("the message SLOT points at its selected variant (D26 pointer + circular-FK dance)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_slot");
  const { messageId, variantId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_slot",
    rawVar: "message_variant_slot",
    content: "hello world",
    seq: 1,
  });

  const slot = (await db.select().from(messages).where(eq(messages.id, messageId)))[0];
  expect(slot?.selectedVariantId).toBe(variantId);
  expect(slot?.role).toBe("assistant");
  expect(slot?.excludedFromPrompt).toBe(false);
  // Content/economics live ONLY on the variant (D26 — no content column on the slot).
  const variant = (
    await db.select().from(messageVariants).where(eq(messageVariants.id, variantId))
  )[0];
  expect(variant?.content).toBe("hello world");
  expect(variant?.messageId).toBe(messageId);
  expect(variant?.idx).toBe(0);
});

test("a swipe APPENDs a variant and selectVariant flips the slot pointer (no content copy)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_swipe");
  const { messageId, variantId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_swipe",
    rawVar: "message_variant_swipe_0",
    content: "first take",
    seq: 1,
  });
  // Append a second swipe (idx 1) and repoint the slot — attribution (slot) is unchanged.
  const swipeId = castId<MessageVariantId>("message_variant_swipe_1");
  await db
    .insert(messageVariants)
    .values({ id: swipeId, messageId, idx: 1, content: "second take" });
  await db.update(messages).set({ selectedVariantId: swipeId }).where(eq(messages.id, messageId));

  const slot = (await db.select().from(messages).where(eq(messages.id, messageId)))[0];
  expect(slot?.selectedVariantId).toBe(swipeId);
  const all = await db
    .select()
    .from(messageVariants)
    .where(eq(messageVariants.messageId, messageId));
  expect(all).toHaveLength(2);
  // The original variant is untouched (the flip is a pointer move, not a content rewrite).
  expect(all.find((v) => v.id === variantId)?.content).toBe("first take");
});

test("message_variants economics + JSON params round-trip (numbers, not Dates)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_econ");
  const messageId = castId<MessageId>("message_econ");
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant" });
  const variantId = castId<MessageVariantId>("message_variant_econ");
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: "x",
    tokensIn: 100,
    tokensOut: 42,
    costUsd: 0.0012,
    contextWindow: 200_000,
    ttftMs: 350,
    finishReason: "stop",
    params: { temperature: 0.7 },
    genStartedAt: T0,
    genFinishedAt: T0 + 1000,
  });

  const v = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  expect(v?.tokensIn).toBe(100);
  expect(v?.costUsd).toBeCloseTo(0.0012);
  expect(v?.contextWindow).toBe(200_000);
  expect(v?.genStartedAt).toBeTypeOf("number");
  expect(parseRecord(v?.params)).toEqual({ temperature: 0.7 });
});

test("message_variants toolCalls (untyped json) + apiErrorStatus round-trip (number as number)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_genrec");
  const messageId = castId<MessageId>("message_genrec");
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant" });
  const variantId = castId<MessageVariantId>("message_variant_genrec");
  // A failed generation: an HTTP status diagnostics signal + a reserved tool-call record blob.
  const apiErrorStatus = 429;
  const toolCalls = [{ name: "search", args: { q: "nope" } }];
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: "",
    terminalReason: "api_error",
    apiErrorStatus,
    toolCalls,
  });

  const v = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  // The HTTP status survives as a NUMBER (never a string/Date).
  expect(v?.apiErrorStatus).toBeTypeOf("number");
  expect(v?.apiErrorStatus).toBe(apiErrorStatus);
  expect(v?.terminalReason).toBe("api_error");
  // The untyped json round-trips through the driver as the stored shape.
  expect(v?.toolCalls).toEqual(toolCalls);
});

test("deleting a message CASCADEs its variants (D26)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_msgdel");
  const { messageId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_del",
    rawVar: "message_variant_del",
    content: "bye",
    seq: 1,
  });
  await db.delete(messages).where(eq(messages.id, messageId));
  expect(
    await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId)),
  ).toHaveLength(0);
});

// ── chat_participants: the XOR CHECK + the (chatId,userId) UNIQUE ─────────────

test("a human participant (userId only) and a character participant (characterId only) insert", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "user_part_ok");
  const chatId = await seedChat(db, "chat_part_ok");
  const characterId = await seedCharacter(db, ownerId, "character_part_ok");

  await db.insert(chatParticipants).values([
    {
      id: castId<ChatParticipantId>("chat_participant_human"),
      chatId,
      kind: "human",
      userId: ownerId,
      role: "host",
      joinSeq: 0,
    },
    {
      id: castId<ChatParticipantId>("chat_participant_char"),
      chatId,
      kind: "character",
      characterId,
      role: "member",
      joinSeq: 0,
    },
  ]);

  const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
  expect(rows).toHaveLength(2);
  const human = rows.find((r) => r.kind === "human");
  expect(human?.userId).toBe(ownerId);
  expect(human?.characterId).toBeNull();
  // Lifecycle defaults.
  expect(human?.talkativeness).toBeCloseTo(0.5);
  expect(human?.disabled).toBe(false);
  expect(human?.leftSeq).toBeNull();
  expect(human?.joinHistoryVisibility).toBe("from-join");
});

test("the actor XOR CHECK rejects BOTH userId+characterId set", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "user_xor_both");
  const chatId = await seedChat(db, "chat_xor_both");
  const characterId = await seedCharacter(db, ownerId, "character_xor_both");

  let caught: unknown;
  try {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_both"),
      chatId,
      kind: "human",
      userId: ownerId,
      characterId,
      role: "member",
      joinSeq: 0,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("the actor XOR CHECK rejects NEITHER userId nor characterId set", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_xor_neither");

  let caught: unknown;
  try {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_neither"),
      chatId,
      kind: "human",
      role: "member",
      joinSeq: 0,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("(chatId,userId) is UNIQUE for humans; character rows (null userId) coexist", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "user_uniq");
  const chatId = await seedChat(db, "chat_uniq");
  const charA = await seedCharacter(db, ownerId, "character_uniq_a");
  const charB = await seedCharacter(db, ownerId, "character_uniq_b");

  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>("chat_participant_u1"),
    chatId,
    kind: "human",
    userId: ownerId,
    role: "host",
    joinSeq: 0,
  });

  // A second human row for the SAME (chat,user) collides on the unique index.
  let caught: unknown;
  try {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_u2"),
      chatId,
      kind: "human",
      userId: ownerId,
      role: "member",
      joinSeq: 1,
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  // SQLite reports a unique-index collision as "UNIQUE constraint failed".
  expect(isConstraintViolation(caught)?.kind).toBe("unique");

  // Two CHARACTER rows (userId NULL) coexist — SQLite UNIQUE ignores NULLs.
  await db.insert(chatParticipants).values([
    {
      id: castId<ChatParticipantId>("chat_participant_ca"),
      chatId,
      kind: "character",
      characterId: charA,
      role: "member",
      joinSeq: 0,
    },
    {
      id: castId<ChatParticipantId>("chat_participant_cb"),
      chatId,
      kind: "character",
      characterId: charB,
      role: "member",
      joinSeq: 0,
    },
  ]);
  expect(
    await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId)),
  ).toHaveLength(3);
});

// ── fork lineage (D27) ───────────────────────────────────────────────────────

test("a fork's parentChatId SET NULL on parent delete (the fork outlives its parent)", async () => {
  const db = await freshDb();
  const parentId = await seedChat(db, "chat_parent");
  const forkId = castId<ChatId>("chat_fork");
  await db.insert(chats).values({ id: forkId, parentChatId: parentId, forkedAt: T0 });

  // Sanity: the lineage pointer is set.
  let fork = (await db.select().from(chats).where(eq(chats.id, forkId)))[0];
  expect(fork?.parentChatId).toBe(parentId);
  expect(fork?.forkedAt).toBe(T0);

  // Deleting the parent must NOT delete the fork — the self-FK is SET NULL.
  await db.delete(chats).where(eq(chats.id, parentId));
  fork = (await db.select().from(chats).where(eq(chats.id, forkId)))[0];
  expect(fork).toBeDefined();
  expect(fork?.parentChatId).toBeNull();
});

// ── chat_invites (status enum + token discipline) ────────────────────────────

test("chat_invites stores a HASHED token (no raw token column) + status defaults pending", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_inv");
  const inviteId = castId<ChatInviteId>("chat_invite_1");
  await db.insert(chatInvites).values({
    id: inviteId,
    chatId,
    tokenHash: "sha256-of-the-csprng-token",
    maxUses: 5,
    expiresAt: T0 + 86_400_000,
  });

  const row = (await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId)))[0];
  expect(row?.status).toBe("pending");
  expect(row?.uses).toBe(0);
  expect(row?.maxUses).toBe(5);
  expect(row?.tokenHash).toBe("sha256-of-the-csprng-token");
  // The raw token is NEVER stored — only the hash column exists.
  expect(Object.keys(row ?? {})).not.toContain("token");
});

test("chat_invites status CHECK rejects an out-of-enum value", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_inv_bad");
  let caught: unknown;
  try {
    await db.insert(chatInvites).values({
      id: castId<ChatInviteId>("chat_invite_bad"),
      chatId,
      tokenHash: "h",
      status: "teleported" as unknown as (typeof INVITE_STATUSES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── enum test-mirrors (db column .enumValues === the canonical tuple) ─────────

test("test-mirror: every chat enum column derives its canonical tuple", () => {
  expect([...messages.role.enumValues]).toEqual([...MESSAGE_ROLES]);
  expect([...chatInjections.role.enumValues]).toEqual([...MESSAGE_ROLES]);
  expect([...chatParticipants.kind.enumValues]).toEqual([...PARTICIPANT_KINDS]);
  expect([...chatParticipants.role.enumValues]).toEqual([...PARTICIPANT_ROLES]);
  expect([...chatParticipants.joinHistoryVisibility.enumValues]).toEqual([
    ...JOIN_HISTORY_VISIBILITIES,
  ]);
  expect([...chatInvites.status.enumValues]).toEqual([...INVITE_STATUSES]);
  // Local tuples tied (via `satisfies`) to the contract wire types — mirror the expected members.
  expect([...chatInjections.position.enumValues]).toEqual([
    "before_prompt",
    "in_static",
    "in_prompt",
    "in_chat",
  ]);
  expect([...chatStreamEvents.kind.enumValues]).toEqual(["text", "reasoning"]);
});

test("PARTICIPANT_KINDS reserves `observer` but it is NOT wired into the XOR (3-member tuple, 2-way XOR)", () => {
  // The kind column knows all three; only human/character are insertable today (the XOR has no observer arm).
  expect([...chatParticipants.kind.enumValues]).toContain("observer");
  expect(PARTICIPANT_KINDS).toEqual(["human", "character", "observer"]);
});

// ── chat_events (the ChatBusEvent discriminant CHECK) ────────────────────────

test("chat_events accepts a known bus type and rejects an unknown one", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "chat_evt");
  await db.insert(chatEvents).values({
    id: castId<ChatEventId>("chat_event_ok"),
    chatId,
    seq: 1,
    type: "chatCreated",
    payload: { type: "chatCreated", chatId },
  });
  const row = (await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId)))[0];
  expect(row?.type).toBe("chatCreated");
  expect(row?.payload).toEqual({ type: "chatCreated", chatId });

  let caught: unknown;
  try {
    await db.insert(chatEvents).values({
      id: castId<ChatEventId>("chat_event_bad"),
      chatId,
      seq: 2,
      type: "nope" as unknown as (typeof chatEvents.$inferInsert)["type"],
      payload: { type: "chatCreated", chatId },
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── the chat-children CASCADE on chat delete ─────────────────────────────────

test("deleting a chat CASCADEs every child table", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, "user_cascade");
  const hostId = await seedUser(db, "user_cascade_host");
  const chatId = await seedChat(db, "chat_cascade");
  const characterId = await seedCharacter(db, ownerId, "character_cascade_chat");

  // One row in each of the ten dependents (chats itself + nine FK-CASCADE children).
  const { messageId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_cascade",
    rawVar: "message_variant_cascade",
    content: "hi",
    seq: 1,
  });
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>("chat_participant_cascade"),
    chatId,
    kind: "character",
    characterId,
    role: "member",
    joinSeq: 0,
  });
  await db.insert(chatInvites).values({
    id: castId<ChatInviteId>("chat_invite_cascade"),
    chatId,
    tokenHash: "h-cascade",
  });
  await db.insert(pendingTurns).values({
    id: castId<PendingTurnId>("pending_turn_cascade"),
    chatId,
    triggeredBy: ownerId,
    runAsUserId: hostId,
  });
  await db.insert(chatEvents).values({
    id: castId<ChatEventId>("chat_event_cascade"),
    chatId,
    seq: 1,
    type: "chatCreated",
    payload: { type: "chatCreated", chatId },
  });
  await db.insert(chatStreamEvents).values({
    id: castId<ChatStreamEventId>("chat_stream_event_cascade"),
    chatId,
    messageId,
    seq: 1,
    kind: "text",
    delta: "hi",
  });
  await db.insert(chatInjections).values({
    id: castId<ChatInjectionId>("chat_injection_cascade"),
    chatId,
    position: "in_chat",
    depth: 0,
    role: "system",
    content: "note",
  });
  await db.insert(chatLocks).values({
    chatId,
    holder: "replica-1",
    acquiredAt: T0,
    expiresAt: T0 + 300_000,
  });

  await db.delete(chats).where(eq(chats.id, chatId));

  // Every dependent is gone (FK CASCADE on chatId; message_variants via the message CASCADE chain).
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(0);
  expect(
    await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId)),
  ).toHaveLength(0);
  expect(await db.select().from(chatInvites).where(eq(chatInvites.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(pendingTurns).where(eq(pendingTurns.chatId, chatId))).toHaveLength(
    0,
  );
  expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toHaveLength(0);
  expect(
    await db.select().from(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId)),
  ).toHaveLength(0);
  expect(
    await db.select().from(chatInjections).where(eq(chatInjections.chatId, chatId)),
  ).toHaveLength(0);
  expect(await db.select().from(chatLocks).where(eq(chatLocks.chatId, chatId))).toHaveLength(0);
});
