// Shared test harness for the chat `persistence/` slice (NOT a test file — no `.test` suffix, so test-layout
// ignores it). Seeds the chat-cluster rows the queries read directly. A fixture may read/insert `users` — the
// `no-direct-users-read` gate scopes only `packages/server/src/domain`, not tests. Timestamps are explicit
// (the persistence layer takes the clock as a PARAM; the schema's `unixepoch()` default would be
// non-deterministic, so every seeded row stamps `FROZEN_AT`).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import {
  characters,
  chatEvents,
  chatParticipants,
  chatStreamEvents,
  chats,
  messages,
  messageVariants,
  pendingTurns,
  users,
} from "@orb/db";
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
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { can } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/contract/context";

export const FROZEN_AT = 1_750_000_000_000;

/** Insert a `users` row; returns its branded id. */
export async function seedUser(db: Db, handle: string): Promise<UserId> {
  const id = castId<UserId>(`user_${handle}`);
  await db.insert(users).values({
    id,
    handle: castId<Handle>(handle),
    role: "user",
    enabled: true,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a flat `characters` row (D28 — no version table); returns its branded id. */
export async function seedCharacter(db: Db, ownerId: UserId, key: string): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({
    id,
    handle: key,
    ownerId,
    name: key,
    contentHash: `hash_${key}`,
    createdAt: FROZEN_AT,
  });
  return id;
}

/** Insert a `chats` row (membership-scoped — no ownerId, D18); returns its branded id. */
export async function seedChat(
  db: Db,
  key: string,
  overrides: {
    readonly title?: string | null;
    readonly archived?: boolean;
    readonly parentChatId?: ChatId | null;
    readonly metadata?: Record<string, unknown> | null;
    readonly updatedAt?: number;
  } = {},
): Promise<ChatId> {
  const id = castId<ChatId>(`chat_${key}`);
  await db.insert(chats).values({
    id,
    title: overrides.title ?? null,
    archived: overrides.archived ?? false,
    parentChatId: overrides.parentChatId ?? null,
    // The JSON column is `$type<ChatMetadata>()`; tests inject raw blobs (incl. malformed) — cast at the seam.
    metadata: (overrides.metadata ?? null) as never,
    createdAt: FROZEN_AT,
    updatedAt: overrides.updatedAt ?? FROZEN_AT,
  });
  return id;
}

/** Insert a `chat_participants` row; returns its branded id. */
export async function seedParticipant(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly key: string;
    readonly userId?: UserId;
    readonly characterId?: CharacterId;
    readonly role?: ParticipantRole;
    readonly joinSeq?: number;
    readonly leftSeq?: number | null;
    readonly disabled?: boolean;
    readonly activePersonaId?: PersonaId | null;
  },
): Promise<ChatParticipantId> {
  const id = castId<ChatParticipantId>(`chat_participant_${opts.key}`);
  await db.insert(chatParticipants).values({
    id,
    chatId: opts.chatId,
    kind: opts.userId !== undefined ? "human" : "character",
    userId: opts.userId ?? null,
    characterId: opts.characterId ?? null,
    role: opts.role ?? "member",
    activePersonaId: opts.activePersonaId ?? null,
    disabled: opts.disabled ?? false,
    joinedAt: FROZEN_AT,
    joinSeq: opts.joinSeq ?? 0,
    leftSeq: opts.leftSeq ?? null,
  });
  return id;
}

/** Insert a message SLOT + its first variant + the `selectedVariantId` pointer (D26 — the 3-step circular-FK
 *  dance). Returns both ids. */
export async function seedMessage(
  db: Db,
  chatId: ChatId,
  seq: number,
  overrides: {
    readonly role?: MessageRole;
    readonly characterId?: CharacterId | null;
    readonly authorUserId?: UserId | null;
    readonly personaId?: PersonaId | null;
    readonly excludedFromPrompt?: boolean;
    readonly content?: string;
  } = {},
): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const messageId = castId<MessageId>(`message_${chatId}_${seq}`);
  const variantId = castId<MessageVariantId>(`variant_${chatId}_${seq}_0`);
  await db.insert(messages).values({
    id: messageId,
    chatId,
    seq,
    role: overrides.role ?? "assistant",
    characterId: overrides.characterId ?? null,
    authorUserId: overrides.authorUserId ?? null,
    personaId: overrides.personaId ?? null,
    excludedFromPrompt: overrides.excludedFromPrompt ?? false,
    createdAt: FROZEN_AT,
  });
  await db.insert(messageVariants).values({
    id: variantId,
    messageId,
    idx: 0,
    content: overrides.content ?? `body-${seq}`,
    createdAt: FROZEN_AT,
  });
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
  return { messageId, variantId };
}

/** Append an extra variant (swipe) to an existing slot — for the `variantCount` / `selectedVariantIdx` reads. */
export async function addVariant(
  db: Db,
  messageId: MessageId,
  idx: number,
  content: string,
): Promise<MessageVariantId> {
  const variantId = castId<MessageVariantId>(`variant_${messageId}_${idx}`);
  await db
    .insert(messageVariants)
    .values({ id: variantId, messageId, idx, content, createdAt: FROZEN_AT });
  return variantId;
}

/** Insert a durable chat-bus log row. */
export async function seedChatEvent(
  db: Db,
  chatId: ChatId,
  seq: number,
  text: string,
): Promise<ChatEventId> {
  const id = castId<ChatEventId>(`chat_event_${chatId}_${seq}`);
  const payload: ChatBusEvent = { type: "delta", chatId, delta: { chatId, kind: "text", text } };
  await db
    .insert(chatEvents)
    .values({ id, chatId, seq, type: "delta", payload, createdAt: FROZEN_AT });
  return id;
}

/** Insert a resumable SSE token-log row. */
export async function seedStreamEvent(
  db: Db,
  chatId: ChatId,
  seq: number,
  delta: string,
): Promise<ChatStreamEventId> {
  const id = castId<ChatStreamEventId>(`stream_event_${chatId}_${seq}`);
  await db
    .insert(chatStreamEvents)
    .values({ id, chatId, seq, kind: "text", delta, messageId: null, createdAt: FROZEN_AT });
  return id;
}

/** Insert a deferred (host-offline) turn. */
export async function seedPendingTurn(
  db: Db,
  opts: {
    readonly chatId: ChatId;
    readonly key: string;
    readonly triggeredBy: UserId;
    readonly runAsUserId: UserId;
    readonly createdAt?: number;
  },
): Promise<PendingTurnId> {
  const id = castId<PendingTurnId>(`pending_turn_${opts.key}`);
  await db.insert(pendingTurns).values({
    id,
    chatId: opts.chatId,
    triggeredBy: opts.triggeredBy,
    runAsUserId: opts.runAsUserId,
    createdAt: opts.createdAt ?? FROZEN_AT,
  });
  return id;
}

/**
 * Build a full `ChatContext` for the verb int-tests — the REAL db + the REAL admin `can()` (the PD-1 unified
 * seam, wired as the root will) + a frozen clock + deterministic id minters. Every cross-feature op defaults
 * to a throwing stub (an accidental reach fails loudly), overridable per test (`getCard`/`emitNotification`
 * are the ones these verbs touch). The chat bus `emit` is NOT a ctx field (chat's own collaborator) — tests
 * pass a spy `emit` as the verb factory's second arg.
 */
export function makeChatContext(db: Db, overrides: Partial<ChatContext> = {}): ChatContext {
  let counter = 0;
  const mint =
    <T extends string>(prefix: string): (() => T) =>
    (): T => {
      counter += 1;
      return castId<T>(`${prefix}_${counter}`);
    };
  // ONE throwing stub for every cross-feature op these verbs do not touch — an accidental reach fails loudly.
  const notStubbed = (): never => {
    throw new Error("ChatContext op not stubbed in this test");
  };
  const base: ChatContext = {
    db,
    now: () => FROZEN_AT,
    can,
    newChatId: mint<ChatId>("chat"),
    newMessageId: mint<MessageId>("message"),
    newMessageVariantId: mint<MessageVariantId>("variant"),
    newParticipantId: mint<ChatParticipantId>("chat_participant"),
    newInjectionId: mint<ChatInjectionId>("chat_injection"),
    newEventId: mint<ChatEventId>("chat_event"),
    newStreamEventId: mint<ChatStreamEventId>("stream_event"),
    newInviteId: mint<ChatInviteId>("chat_invite"),
    hashToken: (token) => `h:${token}`,
    audit: () => Promise.resolve(),
    // Default = the NATIVE replace (no node:vm) — deterministic + fast for tests. A test that exercises the
    // D53 watchdog seam (WI/SEND/RECEIVE) overrides this with a fake that throws on a pathological pattern.
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    runChatTurn: notStubbed,
    resolveChat: notStubbed,
    resolveCredential: notStubbed,
    maybeRevokeOnAuthFailed: notStubbed,
    getCard: () => Promise.resolve(null),
    resolveImageUrl: notStubbed,
    resolveUserPublics: notStubbed,
    mintSyntheticGroupCharacter: notStubbed,
    // The assemble gather calls this every round (round-level recall over the shared bucket); default to
    // "not yet minted" so a test that seeds no memory never reaches the recall search.
    findSyntheticGroupCharacter: () => Promise.resolve(null),
    applyStatsDelta: notStubbed,
    summarize: notStubbed,
    summarizerContextTokens: 32_000,
    emitNotification: () => Promise.resolve(),
    readPresence: notStubbed,
    embeddingsStore: notStubbed,
    searchDigests: notStubbed,
    searchCorpus: notStubbed,
    log: () => undefined,
    getGroupConfig: notStubbed,
    getRoomOverrides: notStubbed,
  };
  return { ...base, ...overrides };
}
