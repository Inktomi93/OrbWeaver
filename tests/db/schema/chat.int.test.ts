// .int tests for schema/chat — the chat cluster (D16/D18/D25/D26/D27/D28). Real libSQL :memory: via
// freshDb (FK PRAGMA ON). Covers: the message SLOT ↔ variant relationship (selectedVariantId pointer, the
// circular-FK insert dance, swipe repoint — D26); the chat_participants kind-shape CHECK (D60 — per-kind
// shape incl. the agent arm; both/neither/cross-shape rejected) + the (chatId,userId) UNIQUE (humans dedup,
// characters coexist); the fork self-FK (parentChatId
// SET NULL on parent delete — D27); invites (status enum + CHECK, token stored HASHED never raw); the
// chats.metadata JSON round-trip via the @orb/db/kit read seam; every enum test-mirror (db column ===
// canonical tuple); chat_events type CHECK over the ChatBusEvent discriminant; and the chat-children
// CASCADE on chat delete (all ten dependents vanish).

import type { OpeningPolicy, ToolCallRecord } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, INVITE_STATUSES, JOIN_HISTORY_VISIBILITIES, MESSAGE_KINDS, PARTICIPANT_KINDS } from "@orb/contracts/chat";
import { PARTICIPANT_ROLES } from "@orb/contracts/identity";
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
  messages,
  messageVariants,
  pendingTurns,
} from "@orb/db";
import { isConstraintViolation, parseRecord } from "@orb/db/kit";
import type {
  CharacterHandle,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  MessageId,
  MessageVariantId,
  PendingTurnId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { seedPersona } from "../../support/factories/persona.ts";
import { expect, test } from "../../support/fixtures.ts";
import { seedChat, seedUser } from "./_support.ts";

// A fixed clock value (epoch-ms number) for caller-set timestamps — deterministic, no ambient clock.
const T0 = 1_700_000_000_000;

async function seedCharacter(db: Db, ownerId: UserId, raw: string): Promise<CharacterId> {
  const id = castId<CharacterId>(raw);
  await db.insert(characters).values({ id, handle: castId<CharacterHandle>(`card-${raw}`), ownerId, contentHash: `hash-${raw}`, name: raw });
  return id;
}

// The D26 insert dance: a slot is born WITHOUT a selected variant (the circular FK is null-broken), the
// variant is inserted, then the slot's pointer is set. Returns the slot + variant ids.
async function seedMessageWithVariant(
  db: Db,
  o: { chatId: ChatId; rawMsg: string; rawVar: string; content: string; seq: number },
): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const messageId = castId<MessageId>(o.rawMsg);
  const variantId = castId<MessageVariantId>(o.rawVar);
  await db.insert(messages).values({ id: messageId, chatId: o.chatId, seq: o.seq, role: "assistant" });
  await db.insert(messageVariants).values({ id: variantId, messageId, idx: 0, content: o.content });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  return { messageId, variantId };
}

test("chats insert→select round-trips (defaults; NO ownerId — D18)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_rt" });

  const rows = await db.select().from(chats).where(eq(chats.id, chatId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(chatId);
  expect(row?.star).toBe(false);
  expect(row?.archived).toBe(false);
  expect(row?.temporary).toBe(false);
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
  // The per-chat ChoiceBlock variable flush (setVariables writes it; getVariablePicks reads it).
  const variableValues = { a: "1" };
  // The D46 DERIVED runtime cache — distinct column from the config-plane `variableValues` store.
  const runtimeVariables = { mood: "happy", turns: "3" };
  await db.insert(chats).values({
    id: chatId,
    variableValues,
    runtimeVariables,
    importedFrom: "session-2026.jsonl",
    importHash: "sha256-of-import-bytes",
  });

  const row = (await db.select().from(chats).where(eq(chats.id, chatId)))[0];
  // The typed read (drizzle hands back the parsed object as-is) + the generic read-seam parser.
  expect(row?.variableValues).toEqual(variableValues);
  expect(parseRecord(row?.variableValues)).toEqual(variableValues);
  // The runtime cache round-trips independently of the config store (two planes, two columns — D46).
  expect(row?.runtimeVariables).toEqual(runtimeVariables);
  expect(parseRecord(row?.runtimeVariables)).toEqual(runtimeVariables);
  expect(row?.importedFrom).toBe("session-2026.jsonl");
  expect(row?.importHash).toBe("sha256-of-import-bytes");
});

test("the standalone (out-of-turn) variable delta log round-trips (automation-design/03 §1.1)", async () => {
  const db = await freshDb();
  const chatId = castId<ChatId>("chat_standalone_deltas");
  const standaloneVariableDeltas = [{ seq: 2, delta: [{ op: "set" as const, key: "mood", value: "calm" }] }];
  await db.insert(chats).values({ id: chatId, standaloneVariableDeltas });
  const row = (await db.select().from(chats).where(eq(chats.id, chatId)))[0];
  expect(row?.standaloneVariableDeltas).toEqual(standaloneVariableDeltas);
});

test("the initiator CHECK rejects an out-of-tuple value (messages_initiator_check; automation-design/03 §4)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_initiator_check" });
  let caught: unknown;
  try {
    // Cast past the TS enum to prove the DB-level CHECK (not the type) bites.
    await db.insert(messages).values({ id: castId<MessageId>("message_bad_initiator"), chatId, seq: 1, role: "assistant", initiator: "bogus" as "human" });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── messages.kind — the row-PURPOSE axis (stickler 2026-08-08 canon-message-identity) ────────────────
// Three pins: the DEFAULT (every pre-existing writer keeps minting story canon with no code change and the
// pre-launch baseline needs no backfill), the tuple CHECK, and the one structural shape arm.

test("a slot is born kind='standard' — the DEFAULT no existing writer has to state", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_kind_default" });
  await db.insert(messages).values({ id: castId<MessageId>("message_kind_default"), chatId, seq: 1, role: "assistant" });
  const row = (await db.select().from(messages).where(eq(messages.chatId, chatId)))[0];
  expect(row?.kind).toBe("standard");
});

test("the kind CHECK rejects an out-of-tuple value (messages_kind_check)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_kind_check" });
  let caught: unknown;
  try {
    // Cast past the TS enum to prove the DB-level CHECK (not the type) bites.
    await db.insert(messages).values({ id: castId<MessageId>("message_bad_kind"), chatId, seq: 1, role: "assistant", kind: "aside" as "standard" });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("the kind-shape CHECK: a narrator row is assistant-voiced in canon, and a narrator USER row is refused", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_kind_shape" });
  const chatId = await seedChat(db, { id: "chat_kind_shape" });
  const characterId = await seedCharacter(db, ownerId, "character_kind_shape");
  await db.insert(messages).values({ id: castId<MessageId>("message_kind_narrator"), chatId, seq: 1, role: "assistant", kind: "narrator", characterId });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
  let caught: unknown;
  try {
    await db
      .insert(messages)
      .values({ id: castId<MessageId>("message_kind_bad_narrator"), chatId, seq: 2, role: "user", kind: "narrator", authorUserId: ownerId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("the kind-shape CHECK leaves `comment` free of a role constraint (a human, an agent or the narrator may make one)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_kind_comment" });
  const chatId = await seedChat(db, { id: "chat_kind_comment" });
  await db.insert(messages).values({ id: castId<MessageId>("message_kind_comment_u"), chatId, seq: 1, role: "user", kind: "comment", authorUserId: ownerId });
  await db.insert(messages).values({ id: castId<MessageId>("message_kind_comment_a"), chatId, seq: 2, role: "assistant", kind: "comment" });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(2);
});

// ── message_variants: the raw + freeze provenance columns (stickler §3 / R2 storage) ──────────────────

test("a variant's raw + freeze provenance round-trips; both are NULL when nothing transformed or froze", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_raw_freeze" });
  const { variantId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_raw_freeze",
    rawVar: "variant_raw_freeze",
    content: "I roll 7 and win",
    seq: 1,
  });
  await db
    .update(messageVariants)
    .set({ rawContent: "I roll {{roll:d20}} and win", macroFreezes: [{ name: "roll", args: "d20", value: "7" }] })
    .where(eq(messageVariants.id, variantId));
  const row = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  expect(row?.rawContent).toBe("I roll {{roll:d20}} and win");
  expect(row?.macroFreezes).toEqual([{ name: "roll", args: "d20", value: "7" }]);

  const plain = await seedMessageWithVariant(db, { chatId, rawMsg: "message_no_freeze", rawVar: "variant_no_freeze", content: "just words", seq: 2 });
  const untouched = (await db.select().from(messageVariants).where(eq(messageVariants.id, plain.variantId)))[0];
  // NULL ⇔ raw is byte-identical to content / nothing froze — the common case, never a redundant copy.
  expect(untouched?.rawContent).toBeNull();
  expect(untouched?.macroFreezes).toBeNull();
});

// ── messages ↔ message_variants (D26) ────────────────────────────────────────

test("the message SLOT points at its selected variant (D26 pointer + circular-FK dance)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_slot" });
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
  const variant = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  expect(variant?.content).toBe("hello world");
  expect(variant?.messageId).toBe(messageId);
  expect(variant?.idx).toBe(0);
});

test("a swipe APPENDs a variant and selectVariant flips the slot pointer (no content copy)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_swipe" });
  const { messageId, variantId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_swipe",
    rawVar: "message_variant_swipe_0",
    content: "first take",
    seq: 1,
  });
  // Append a second swipe (idx 1) and repoint the slot — attribution (slot) is unchanged.
  const swipeId = castId<MessageVariantId>("message_variant_swipe_1");
  await db.insert(messageVariants).values({ id: swipeId, messageId, idx: 1, content: "second take" });
  await db.update(messages).set({ selectedVariantId: swipeId }).where(eq(messages.id, messageId));

  const slot = (await db.select().from(messages).where(eq(messages.id, messageId)))[0];
  expect(slot?.selectedVariantId).toBe(swipeId);
  const all = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
  expect(all).toHaveLength(2);
  // The original variant is untouched (the flip is a pointer move, not a content rewrite).
  expect(all.find((v) => v.id === variantId)?.content).toBe("first take");
});

test("message_variants economics + JSON params round-trip (numbers, not Dates)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_econ" });
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

test("message_variants toolCalls (ToolCallRecord[] json) + apiErrorStatus round-trip (number as number)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_genrec" });
  const messageId = castId<MessageId>("message_genrec");
  await db.insert(messages).values({ id: messageId, chatId, seq: 1, role: "assistant" });
  const variantId = castId<MessageVariantId>("message_variant_genrec");
  // A failed generation: an HTTP status diagnostics signal + the D48 tool-call records (PD-54 retype — the
  // column is now `.$type<readonly ToolCallRecord[]>()`; the driver round-trips the DTO shape).
  const apiErrorStatus = 429;
  const toolCalls: readonly ToolCallRecord[] = [
    {
      toolCallId: "call_1",
      name: "search",
      arguments: '{"q":"nope"}',
      result: '{"hits":0}',
      isError: false,
      durationMs: 12,
    },
  ];
  // The D46 per-variant delta (`variable_delta`) — the ordered ops this variant applied.
  const variableDelta: readonly VarOp[] = [
    { op: "set", key: "mood", value: "happy" },
    { op: "inc", key: "turns" },
    { op: "delete", key: "stale" },
  ];
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: "",
    terminalReason: "api_error",
    apiErrorStatus,
    toolCalls,
    variableDelta,
  });

  const v = (await db.select().from(messageVariants).where(eq(messageVariants.id, variantId)))[0];
  // The HTTP status survives as a NUMBER (never a string/Date).
  expect(v?.apiErrorStatus).toBeTypeOf("number");
  expect(v?.apiErrorStatus).toBe(apiErrorStatus);
  expect(v?.terminalReason).toBe("api_error");
  // The typed json round-trips through the driver as the stored ToolCallRecord[] shape.
  expect(v?.toolCalls).toEqual(toolCalls);
  // The per-variant delta round-trips as the stored VarOp[] (the runtime-plane fold source — D46).
  expect(v?.variableDelta).toEqual(variableDelta);
});

test("deleting a message CASCADEs its variants (D26)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_msgdel" });
  const { messageId } = await seedMessageWithVariant(db, {
    chatId,
    rawMsg: "message_del",
    rawVar: "message_variant_del",
    content: "bye",
    seq: 1,
  });
  await db.delete(messages).where(eq(messages.id, messageId));
  expect(await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId))).toHaveLength(0);
});

// ── messages: the born-whole attribution-shape CHECK (`messages_attribution_shape`; owner-ordered 2026-07-17) ──
// STRUCTURAL arms only: characterId ⇒ assistant · personaId ⇒ user · never characterId AND authorUserId
// together. The NOT-NULL-by-role arm is DELIBERATELY not here (the SET-NULL identity-delete degradation —
// schema header): all-NULL is legal, so the CHECK never aborts an FK cascade. NB: these go green only once
// the CHECK is emitted into `0000_baseline.sql` — the regen rides the demo-seed lane's pending regen.

test("the attribution CHECK accepts a character-voiced assistant slot (characterId, no author)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_attr_asst" });
  const chatId = await seedChat(db, { id: "chat_attr_asst" });
  const characterId = await seedCharacter(db, ownerId, "character_attr_asst");
  await db.insert(messages).values({ id: castId<MessageId>("message_attr_asst"), chatId, seq: 1, role: "assistant", characterId });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
});

test("the attribution CHECK accepts an agent-voiced assistant slot (authorUserId, no characterId)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_attr_agent" });
  const chatId = await seedChat(db, { id: "chat_attr_agent" });
  await db.insert(messages).values({ id: castId<MessageId>("message_attr_agent"), chatId, seq: 1, role: "assistant", authorUserId: ownerId });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
});

test("the attribution CHECK accepts a persona-authored user slot (authorUserId + personaId)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_attr_user" });
  const chatId = await seedChat(db, { id: "chat_attr_user" });
  await db.insert(messages).values({ id: castId<MessageId>("message_attr_user"), chatId, seq: 1, role: "user", authorUserId: ownerId });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
});

test("the attribution CHECK accepts a fully-degraded slot (all attribution NULL — the SET-NULL cascade end-state)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_attr_degraded" });
  await db.insert(messages).values({ id: castId<MessageId>("message_attr_degraded"), chatId, seq: 1, role: "user" });
  expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
});

test("the attribution CHECK rejects a user slot carrying a characterId (a character never voices a user line)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_attr_bad_char" });
  const chatId = await seedChat(db, { id: "chat_attr_bad_char" });
  const characterId = await seedCharacter(db, ownerId, "character_attr_bad_char");
  let caught: unknown;
  try {
    await db.insert(messages).values({ id: castId<MessageId>("message_attr_bad_char"), chatId, seq: 1, role: "user", characterId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("the attribution CHECK rejects an assistant slot carrying a personaId (persona authors only a user line)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_attr_bad_persona" });
  // A REAL persona row so the CHECK (not the personaId FK) is what bites.
  const persona = await seedPersona(db, { id: castId<PersonaId>("persona_attr_bad") });
  let caught: unknown;
  try {
    await db.insert(messages).values({ id: castId<MessageId>("message_attr_bad_persona"), chatId, seq: 1, role: "assistant", personaId: persona.id });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

test("the attribution CHECK rejects a slot carrying BOTH characterId and authorUserId (character XOR agent voice)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_attr_both" });
  const chatId = await seedChat(db, { id: "chat_attr_both" });
  const characterId = await seedCharacter(db, ownerId, "character_attr_both");
  let caught: unknown;
  try {
    await db.insert(messages).values({ id: castId<MessageId>("message_attr_both"), chatId, seq: 1, role: "assistant", characterId, authorUserId: ownerId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── chat_participants: the kind-shape CHECK + the (chatId,userId) UNIQUE ─────────────

test("a human participant (userId only) and a character participant (characterId only) insert", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_part_ok" });
  const chatId = await seedChat(db, { id: "chat_part_ok" });
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
  expect(human?.talkativeness).toBeCloseTo(0.5);
  expect(human?.disabled).toBe(false);
  expect(human?.leftSeq).toBeNull();
  // The D16 column default: an unset policy grants the FULL room history (owner ruling — inviting someone
  // into a room gives them its past). `from-join` is the host's opt-in restriction, never the ambient state.
  expect(human?.joinHistoryVisibility).toBe("full");
});

test("the kind-shape CHECK rejects a human with BOTH userId+characterId set", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_xor_both" });
  const chatId = await seedChat(db, { id: "chat_xor_both" });
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

test("the kind-shape CHECK rejects a human with NEITHER userId nor characterId set", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_xor_neither" });

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

test("the kind-shape CHECK rejects a `character` seat carrying a userId (cross-shape)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_char_cross" });
  const chatId = await seedChat(db, { id: "chat_char_cross" });

  let caught: unknown;
  try {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>("chat_participant_char_cross"),
      chatId,
      kind: "character",
      userId: ownerId,
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
  const ownerId = await seedUser(db, { id: "user_uniq" });
  const chatId = await seedChat(db, { id: "chat_uniq" });
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
  expect(await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId))).toHaveLength(3);
});

// ── fork lineage (D27) ───────────────────────────────────────────────────────

test("a fork's parentChatId SET NULL on parent delete (the fork outlives its parent)", async () => {
  const db = await freshDb();
  const parentId = await seedChat(db, { id: "chat_parent" });
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
  const chatId = await seedChat(db, { id: "chat_inv" });
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
  const chatId = await seedChat(db, { id: "chat_inv_bad" });
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
  expect([...messages.kind.enumValues]).toEqual([...MESSAGE_KINDS]);
  expect([...chatInjections.role.enumValues]).toEqual([...MESSAGE_ROLES]);
  expect([...chatParticipants.kind.enumValues]).toEqual([...PARTICIPANT_KINDS]);
  expect([...chatParticipants.role.enumValues]).toEqual([...PARTICIPANT_ROLES]);
  expect([...chatParticipants.joinHistoryVisibility.enumValues]).toEqual([...JOIN_HISTORY_VISIBILITIES]);
  expect([...chatInvites.status.enumValues]).toEqual([...INVITE_STATUSES]);
  // Local tuples tied (via `satisfies`) to the contract wire types — mirror the expected members.
  expect([...chatInjections.position.enumValues]).toEqual(["before_prompt", "in_static", "in_prompt", "in_chat"]);
  expect([...chatStreamEvents.kind.enumValues]).toEqual(["text", "reasoning"]);
});

test("PARTICIPANT_KINDS is the pinned 2-member tuple (human/character)", () => {
  expect([...chatParticipants.kind.enumValues]).toEqual(["human", "character"]);
  expect(PARTICIPANT_KINDS).toEqual(["human", "character"]);
});

// ── chat_events (the ChatBusEvent discriminant CHECK) ────────────────────────

test("chat_events accepts a known bus type and rejects an unknown one", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_evt" });
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
  const ownerId = await seedUser(db, { id: "user_cascade" });
  const hostId = await seedUser(db, { id: "user_cascade_host" });
  const chatId = await seedChat(db, { id: "chat_cascade" });
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
  expect(await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId))).toHaveLength(0);
  expect(await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatInvites).where(eq(chatInvites.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(pendingTurns).where(eq(pendingTurns.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatEvents).where(eq(chatEvents.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatStreamEvents).where(eq(chatStreamEvents.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatInjections).where(eq(chatInjections.chatId, chatId))).toHaveLength(0);
  expect(await db.select().from(chatLocks).where(eq(chatLocks.chatId, chatId))).toHaveLength(0);
});
