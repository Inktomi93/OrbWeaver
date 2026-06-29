// domain/chat/persistence/queries — QUERIES ONLY (chat.md Part I 8-slot `persistence/queries.ts`). The
// membership-scoped chat-row reads (D18 — `loadMemberChat` replaces neo's `loadOwnedChat`; there is no
// `chats.ownerId`, the host is just a `chat_participants` row), the D26 canon reads (slot ⋈ selected-variant),
// and the durable chat-bus + resumable SSE stream-log replay/cursor reads. NO business logic, NO cross-feature
// calls, NO I/O beyond `db`. The agent-sdk frame readers LEAVE to providers (movement table) — not here.
//
// THE ONE JSON-PARSE BOUNDARY: `chats.metadata` is read through `parseChatMetadata` (the contract's
// fault-isolated lazy parser — reused, never re-spelled). Every other column is trusted (db CHECK/FK enforced).
//
// `users` is NEVER joined here (the `no-direct-users-read` chokepoint — admin.md): roster name/handle
// resolution is a verb concern (it takes ids from the resolved Principal + injected ops); persistence returns
// the raw membership-scoped rows. Row/return SHAPES are file-LOCAL (callers read the inferred return) so no
// feature type leaks out of `persistence/` (`types-in-contract`). Timestamps/cursors arrive as PARAMS.

import type { ChatBusEvent, MessageView, ParticipantRole } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import {
  chatEvents,
  chatParticipants,
  chatStreamEvents,
  chats,
  messages,
  messageVariants,
} from "@orb/db";
import type { ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { and, asc, desc, eq, gt, isNull, lt, max, min, sql } from "drizzle-orm";
import type { ChatMetadata } from "../contract/metadata";
import { parseChatMetadata } from "../contract/metadata";
import type { ChatStreamReplayEvent, StreamEventBounds } from "../contract/views";

const LIMIT_ONE = 1;
// The default `listMessages` page window when the verb passes no explicit limit (paged canon read).
const DEFAULT_PAGE_LIMIT = 50;

/** A resolved `chats` row with its `metadata` blob parsed at the one JSON-parse boundary. File-local: the
 *  verb maps it into the `ChatDetail`/`ChatSummary` view (applying the metadata sub-blob defaults). */
interface ChatRow {
  id: ChatId;
  title: string | null;
  star: boolean;
  archived: boolean;
  parentChatId: ChatId | null;
  forkedAt: number | null;
  anchorPersonaId: PersonaId | null;
  compactSummary: string | null;
  compactedAtSeq: number | null;
  metadata: ChatMetadata;
  createdAt: number;
  updatedAt: number;
}

/** One durable chat-bus log row (the replay-ring source of truth) — the cursor + the full room-public event. */
interface ChatEventLogRow {
  seq: number;
  payload: ChatBusEvent;
}

// The chat-row column set, shared by the unscoped + membership-scoped reads (one selection, no re-spell).
const chatRowSelection = {
  id: chats.id,
  title: chats.title,
  star: chats.star,
  archived: chats.archived,
  parentChatId: chats.parentChatId,
  forkedAt: chats.forkedAt,
  anchorPersonaId: chats.anchorPersonaId,
  compactSummary: chats.compactSummary,
  compactedAtSeq: chats.compactedAtSeq,
  metadata: chats.metadata,
  createdAt: chats.createdAt,
  updatedAt: chats.updatedAt,
} as const;

// The D26 slot ⋈ selected-variant projection. `variantCount` is a correlated count over the slot's swipes;
// `selectedVariantId`/`selectedVariantIdx` come off the JOINED variant (non-null post-commit). Field names
// mirror `MessageView` exactly so the read returns the view directly (no re-mapping).
const messageViewSelection = {
  id: messages.id,
  chatId: messages.chatId,
  seq: messages.seq,
  role: messages.role,
  authorUserId: messages.authorUserId,
  characterId: messages.characterId,
  personaId: messages.personaId,
  excludedFromPrompt: messages.excludedFromPrompt,
  createdAt: messages.createdAt,
  editedAt: messages.editedAt,
  selectedVariantId: messageVariants.id,
  selectedVariantIdx: messageVariants.idx,
  variantCount: sql<number>`(select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${messages.id})`,
  content: messageVariants.content,
  reasoning: messageVariants.reasoning,
  model: messageVariants.model,
  provider: messageVariants.provider,
  finishReason: messageVariants.finishReason,
  stopReason: messageVariants.stopReason,
  terminalReason: messageVariants.terminalReason,
  tokensIn: messageVariants.tokensIn,
  tokensOut: messageVariants.tokensOut,
  cacheReadTokens: messageVariants.cacheReadTokens,
  cacheWriteTokens: messageVariants.cacheWriteTokens,
  contextWindow: messageVariants.contextWindow,
  costUsd: messageVariants.costUsd,
  ttftMs: messageVariants.ttftMs,
} as const;

function toChatRow(
  r: { readonly metadata: ChatMetadata | null } & Omit<ChatRow, "metadata">,
): ChatRow {
  return { ...r, metadata: parseChatMetadata(r.metadata) };
}

// ── chat-row reads ────────────────────────────────────────────────────────────

/** Unscoped chat-row read (boot / reap / lineage internals) — the row + its parsed `metadata`, or undefined.
 *  Membership is NOT checked here; the membership-scoped front door is {@link loadMemberChat}. */
export async function loadChatRow(db: Db, chatId: ChatId): Promise<ChatRow | undefined> {
  const rows = await db
    .select(chatRowSelection)
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const r = rows.at(0);
  return r ? toChatRow(r) : undefined;
}

/**
 * The membership-scoped chat read (D18 — replaces neo's `loadOwnedChat`): the chat row joined to the CALLER's
 * PRESENT participant row (`leftSeq IS NULL`), returning the row (metadata parsed) + the caller's `role`
 * (`host|member`). `undefined` ⇒ no such chat OR the caller is not a present member — the two collapse into one
 * leak-free answer (the verb maps it to `ChatNotFoundError`; chat.md Part III §11). The host is just a
 * participant with `role='host'`, so this also yields the authority bit with no extra query.
 */
export async function loadMemberChat(
  db: Db,
  chatId: ChatId,
  userId: UserId,
): Promise<{ chat: ChatRow; role: ParticipantRole } | undefined> {
  const rows = await db
    .select({ ...chatRowSelection, role: chatParticipants.role })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chats.id),
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const r = rows.at(0);
  if (r === undefined) {
    return;
  }
  const { role, ...rest } = r;
  return { chat: toChatRow(rest), role };
}

/** The membership-scoped library list (listChats) — every chat the user is a PRESENT member of (host or
 *  member; pure membership, no `ownerId OR member` branch — D18), newest-updated first. Archived excluded
 *  unless `includeArchived`. Name/preview resolution (`participantNames`) is the verb's (no `users` join). */
export async function listMemberChats(
  db: Db,
  userId: UserId,
  includeArchived = false,
): Promise<ChatRow[]> {
  const base = db
    .select(chatRowSelection)
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chats.id),
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.leftSeq),
      ),
    )
    .$dynamic();
  const scoped = includeArchived ? base : base.where(eq(chats.archived, false));
  const rows = await scoped.orderBy(desc(chats.updatedAt));
  return rows.map(toChatRow);
}

/** The fork CHILDREN of a chat (listForks) — the `chats_parent_idx` lookup. Membership-gating per child is
 *  the verb's (a fork grants no parent membership — inv §16); persistence returns the candidate rows. */
export async function loadForkChildren(db: Db, parentChatId: ChatId): Promise<ChatRow[]> {
  const rows = await db
    .select(chatRowSelection)
    .from(chats)
    .where(eq(chats.parentChatId, parentChatId))
    .orderBy(desc(chats.createdAt));
  return rows.map(toChatRow);
}

// ── canon reads (D26 slot ⋈ selected-variant) ──────────────────────────────────

/** The current canon seq head for a chat (`max(messages.seq)`, 0 when empty). The membership lifecycle stamps
 *  `joinSeq`/`leftSeq` against THIS (Part III §1 — the join/leave horizon lives in `messages.seq`, NOT the
 *  stream cursor); the next-turn writer derives the next seq from it. */
export async function loadMaxMessageSeq(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ maxSeq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return rows.at(0)?.maxSeq ?? 0;
}

/** The FULL canon history for a chat (assembly's substrate), oldest→newest, each slot joined to its SELECTED
 *  variant (D26 — the `innerJoin` drops a mid-insert slot whose pointer isn't set yet; a committed slot always
 *  has one). Includes excluded/hidden slots (the `excludedFromPrompt` flag rides each row; assembly filters). */
export async function loadCanonHistory(db: Db, chatId: ChatId): Promise<MessageView[]> {
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
}

/** A backwards page of canon (listMessages) — the slot ⋈ selected-variant rows strictly before `beforeSeq`
 *  (absent ⇒ from the tail), newest-first, capped at `limit` (default {@link DEFAULT_PAGE_LIMIT}). The verb
 *  reverses for chronological display; this is the windowed read. */
export async function loadMessagesPage(
  db: Db,
  chatId: ChatId,
  beforeSeq?: number,
  limit: number = DEFAULT_PAGE_LIMIT,
): Promise<MessageView[]> {
  const where =
    beforeSeq === undefined
      ? eq(messages.chatId, chatId)
      : and(eq(messages.chatId, chatId), lt(messages.seq, beforeSeq));
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(where)
    .orderBy(desc(messages.seq))
    .limit(limit);
}

// ── stream-log / bus-log replay + cursor reads ─────────────────────────────────

/** Resume the resumable SSE token log (replayStreamEvents) — every `chat_stream_events` row strictly after
 *  `afterSeq` (absent ⇒ from the retained window start), oldest-first (the late-subscriber ramp-up). */
export async function replayStreamEvents(
  db: Db,
  chatId: ChatId,
  afterSeq?: number,
): Promise<ChatStreamReplayEvent[]> {
  const where =
    afterSeq === undefined
      ? eq(chatStreamEvents.chatId, chatId)
      : and(eq(chatStreamEvents.chatId, chatId), gt(chatStreamEvents.seq, afterSeq));
  return await db
    .select({
      seq: chatStreamEvents.seq,
      messageId: chatStreamEvents.messageId,
      kind: chatStreamEvents.kind,
      delta: chatStreamEvents.delta,
    })
    .from(chatStreamEvents)
    .where(where)
    .orderBy(asc(chatStreamEvents.seq));
}

/** The resumable SSE log's replay cursor bounds (streamEventBounds) — the min/max `seq` (null/null when the
 *  retained window is empty), so the consumer can size the replay window. */
export async function streamEventBounds(db: Db, chatId: ChatId): Promise<StreamEventBounds> {
  const rows = await db
    .select({ minSeq: min(chatStreamEvents.seq), maxSeq: max(chatStreamEvents.seq) })
    .from(chatStreamEvents)
    .where(eq(chatStreamEvents.chatId, chatId));
  const r = rows.at(0);
  return { minSeq: r?.minSeq ?? null, maxSeq: r?.maxSeq ?? null };
}

/** Replay the durable chat-bus log (the replay ring's source of truth) — every `chat_events` row strictly
 *  after `afterSeq` (absent ⇒ from the start), oldest-first, the full room-public payload. */
export async function replayChatEvents(
  db: Db,
  chatId: ChatId,
  afterSeq?: number,
): Promise<ChatEventLogRow[]> {
  const where =
    afterSeq === undefined
      ? eq(chatEvents.chatId, chatId)
      : and(eq(chatEvents.chatId, chatId), gt(chatEvents.seq, afterSeq));
  return await db
    .select({ seq: chatEvents.seq, payload: chatEvents.payload })
    .from(chatEvents)
    .where(where)
    .orderBy(asc(chatEvents.seq));
}

/** The durable chat-bus log's cursor bounds — the min/max `seq` (null/null when empty); the `maxSeq` is the
 *  `lastEventId` a fresh subscriber resumes from. */
export async function chatEventBounds(db: Db, chatId: ChatId): Promise<StreamEventBounds> {
  const rows = await db
    .select({ minSeq: min(chatEvents.seq), maxSeq: max(chatEvents.seq) })
    .from(chatEvents)
    .where(eq(chatEvents.chatId, chatId));
  const r = rows.at(0);
  return { minSeq: r?.minSeq ?? null, maxSeq: r?.maxSeq ?? null };
}
