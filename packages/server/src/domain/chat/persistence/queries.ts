// domain/chat/persistence/queries — QUERIES ONLY: membership-scoped chat-row reads, canon reads (slot ⋈
// selected-variant), and durable chat-bus + resumable SSE stream-log replay/cursor reads. No business
// logic, no cross-feature calls, no I/O beyond `db`. `chats.metadata` is read only through
// `parseChatMetadata`. `users` is never joined here — roster name/handle resolution is a verb concern.

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import { variableDeltaSchema } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatEvents, chatInjections, chatParticipants, chatStreamEvents, chats, messages, messageVariants } from "@orb/db";
import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, max, min, ne, sql } from "drizzle-orm";
import type { ChatMetadata } from "../contract/metadata";
import { parseChatMetadata } from "../contract/metadata";
import type { ChatStreamReplayEvent, StreamEventBounds } from "../contract/views";

const LIMIT_ONE = 1;
// The default `listMessages` page window when the verb passes no explicit limit (paged canon read).
const DEFAULT_PAGE_LIMIT = 50;

/** A resolved `chats` row with its `metadata` blob parsed. File-local: the verb maps it into the
 *  `ChatDetail`/`ChatSummary` view. */
interface ChatRow {
  id: ChatId;
  title: string | null;
  star: boolean;
  archived: boolean;
  parentChatId: ChatId | null;
  forkedAt: number | null;
  anchorPersonaId: PersonaId | null;
  /** The pending host-handoff nominee; null = no nomination in flight. */
  pendingHostUserId: UserId | null;
  compactSummary: string | null;
  compactedAtSeq: number | null;
  metadata: ChatMetadata;
  createdAt: number;
  updatedAt: number;
}

/** One durable chat-bus log row — the cursor + the full room-public event. */
interface ChatEventLogRow {
  seq: number;
  payload: ChatBusEvent;
}

// Shared by the unscoped + membership-scoped reads (one selection, no re-spell).
const chatRowSelection = {
  id: chats.id,
  title: chats.title,
  star: chats.star,
  archived: chats.archived,
  parentChatId: chats.parentChatId,
  forkedAt: chats.forkedAt,
  anchorPersonaId: chats.anchorPersonaId,
  pendingHostUserId: chats.pendingHostUserId,
  compactSummary: chats.compactSummary,
  compactedAtSeq: chats.compactedAtSeq,
  metadata: chats.metadata,
  createdAt: chats.createdAt,
  updatedAt: chats.updatedAt,
} as const;

// Slot ⋈ selected-variant projection. Field names mirror `MessageView` exactly so the read returns the
// view directly (no re-mapping).
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
  contextBoundaryMessageId: messageVariants.contextBoundaryMessageId,
  costUsd: messageVariants.costUsd,
  ttftMs: messageVariants.ttftMs,
  genStartedAt: messageVariants.genStartedAt,
  genFinishedAt: messageVariants.genFinishedAt,
  generationId: messageVariants.generationId,
} as const;

function toChatRow(r: { readonly metadata: ChatMetadata | null } & Omit<ChatRow, "metadata">): ChatRow {
  return { ...r, metadata: parseChatMetadata(r.metadata) };
}

// ── chat-row reads ────────────────────────────────────────────────────────────

/** Unscoped chat-row read (boot/reap/lineage internals). Membership is NOT checked here; the
 *  membership-scoped front door is {@link loadMemberChat}. */
export async function loadChatRow(db: Db, chatId: ChatId): Promise<ChatRow | undefined> {
  const rows = await db.select(chatRowSelection).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  const r = rows.at(0);
  return r ? toChatRow(r) : undefined;
}

/** Read the chat's pending host-handoff nominee. `acceptHostHandoff` verifies the caller IS the nominee
 *  before the atomic role swap. */
export async function loadPendingHostUserId(db: Db, chatId: ChatId): Promise<UserId | null> {
  const rows = await db.select({ pendingHostUserId: chats.pendingHostUserId }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  return rows.at(0)?.pendingHostUserId ?? null;
}

/**
 * The membership-scoped chat read: the chat row joined to the caller's present participant row, returning
 * the row + the caller's `role` + `activePersonaId` (the attribution fallback for un-stamped sends).
 * `undefined` ⇒ no such chat OR the caller is not a present member (collapsed into one leak-free answer).
 */
export async function loadMemberChat(
  db: Db,
  chatId: ChatId,
  userId: UserId,
): Promise<{ chat: ChatRow; role: ParticipantRole; activePersonaId: PersonaId | null } | undefined> {
  const rows = await db
    .select({
      ...chatRowSelection,
      role: chatParticipants.role,
      activePersonaId: chatParticipants.activePersonaId,
    })
    .from(chats)
    .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const r = rows.at(0);
  if (r === undefined) {
    return;
  }
  const { role, activePersonaId, ...rest } = r;
  return { chat: toChatRow(rest), role, activePersonaId };
}

/** The membership-scoped library list — every chat the user is a present member of, newest-updated first.
 *  Archived excluded unless `includeArchived`; temporary chats are always hidden (they persist so turns
 *  can run, but never surface in the library — `reapTemporaryChats` sweeps them once expired). */
export async function listMemberChats(db: Db, userId: UserId, includeArchived = false): Promise<ChatRow[]> {
  const base = db
    .select(chatRowSelection)
    .from(chats)
    .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .$dynamic();
  const scoped = includeArchived ? base.where(eq(chats.temporary, false)) : base.where(and(eq(chats.archived, false), eq(chats.temporary, false)));
  const rows = await scoped.orderBy(desc(chats.updatedAt));
  return rows.map(toChatRow);
}

/** The fork children of a chat. Membership-gating per child is the verb's (a fork grants no parent
 *  membership); persistence returns the candidate rows. */
export async function loadForkChildren(db: Db, parentChatId: ChatId): Promise<ChatRow[]> {
  const rows = await db.select(chatRowSelection).from(chats).where(eq(chats.parentChatId, parentChatId)).orderBy(desc(chats.createdAt));
  return rows.map(toChatRow);
}

/** Per-chat canon aggregates for the `ChatSummary` list chrome: message count + newest timestamp. Batched
 *  over a set of ids (one GROUP BY, no N+1); a chat with no messages is absent from the map. */
export async function loadChatMessageStats(db: Db, chatIds: readonly ChatId[]): Promise<Map<ChatId, { messageCount: number; lastMessageAt: number | null }>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map for chat message stats
  const out = new Map<ChatId, { messageCount: number; lastMessageAt: number | null }>();
  if (chatIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({
      chatId: messages.chatId,
      messageCount: count(messages.id),
      lastMessageAt: max(messages.createdAt),
    })
    .from(messages)
    .where(inArray(messages.chatId, [...chatIds]))
    .groupBy(messages.chatId);
  for (const r of rows) {
    out.set(r.chatId, { messageCount: r.messageCount, lastMessageAt: r.lastMessageAt ?? null });
  }
  return out;
}

/** The character-seat ids per chat (the reverse "which chats include character X" read). Batched over a
 *  set of chatIds (one junction read, no N+1). Deduped; includes departed seats (no `leftSeq` filter) —
 *  Activity wants "every chat you've had with them." A chat with no seats is absent from the map. */
export async function loadChatParticipantCharacterIds(db: Db, chatIds: readonly ChatId[]): Promise<Map<ChatId, CharacterId[]>> {
  // @orb-gate-ignore persistence-no-in-memory-state: query-local lookup map for chat participant ids
  const out = new Map<ChatId, CharacterId[]>();
  if (chatIds.length === 0) {
    return out;
  }
  const rows = await db
    .select({ chatId: chatParticipants.chatId, characterId: chatParticipants.characterId })
    .from(chatParticipants)
    .where(and(inArray(chatParticipants.chatId, [...chatIds]), eq(chatParticipants.kind, "character"), isNotNull(chatParticipants.characterId)))
    .orderBy(asc(chatParticipants.joinSeq), asc(chatParticipants.id));
  for (const { chatId, characterId } of rows) {
    if (characterId === null) {
      continue;
    }
    const bucket = out.get(chatId);
    if (bucket === undefined) {
      out.set(chatId, [characterId]);
    } else if (!bucket.includes(characterId)) {
      bucket.push(characterId);
    }
  }
  return out;
}

/** Walk the fork-lineage chain from `chatId` up to its root — unscoped (membership is gated per-ancestor
 *  by the verb). Returns rows self-first; the `visited` set + `maxDepth` cap defend against a cycle. */
export async function loadAncestorChain(db: Db, chatId: ChatId, maxDepth = 64): Promise<ChatRow[]> {
  const chain: ChatRow[] = [];
  // @orb-gate-ignore persistence-no-in-memory-state: query-local visited Set for ancestor chain cycle guard
  const visited = new Set<ChatId>();
  let current: ChatId | undefined = chatId;
  while (current !== undefined && !visited.has(current) && chain.length < maxDepth) {
    visited.add(current);
    // biome-ignore lint/performance/noAwaitInLoops: the lineage is a linked list — each ancestor's id is the prior row's parentChatId, so the walk is inherently sequential.
    const row = await loadChatRow(db, current);
    if (row === undefined) {
      break;
    }
    chain.push(row);
    current = row.parentChatId ?? undefined;
  }
  return chain;
}

// ── canon reads (slot ⋈ selected-variant) ──────────────────────────────────

/** The current canon seq head for a chat (0 when empty). The next-turn writer derives the next seq from it. */
export async function loadMaxMessageSeq(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ maxSeq: max(messages.seq) })
    .from(messages)
    .where(eq(messages.chatId, chatId));
  return rows.at(0)?.maxSeq ?? 0;
}

/** The full canon history for a chat (assembly's substrate), oldest→newest, each slot joined to its
 *  selected variant. Includes excluded/hidden slots (`excludedFromPrompt` rides each row; assembly filters). */
export async function loadCanonHistory(db: Db, chatId: ChatId): Promise<MessageView[]> {
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
}

/** One slot ⋈ its selected variant. The engine re-reads this after an append-variant/continue commit;
 *  undo/revert re-read it for the returned view. `undefined` ⇒ no such committed slot. */
export async function loadMessageView(db: Db, messageId: MessageId): Promise<MessageView | undefined> {
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

// ── Stats-delta canon reads (the delete-messages arm). Full rows so the signed deltas mirror the
// rebuild's streams column-for-column. File-local shapes. ──

/** One canon stat row (the inferred selection, named for the explicit return type). */
interface CanonStatRow {
  messageId: MessageId;
  characterId: CharacterId | null;
  role: MessageRole;
  createdAt: number;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  contextWindow: number | null;
  genStartedAt: number | null;
  genFinishedAt: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  metadata: Record<string, unknown> | null;
  selectedIdx: number;
  variantCount: number;
}

/** One swipe stat row (the NON-selected-variant stream shape). */
interface SwipeStatRow {
  messageId: MessageId;
  characterId: CharacterId | null;
  msgCreatedAt: number;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  genStartedAt: number | null;
  genFinishedAt: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  metadata: Record<string, unknown> | null;
}

const canonStatSelection = {
  messageId: messages.id,
  characterId: messages.characterId,
  role: messages.role,
  createdAt: messages.createdAt,
  content: messageVariants.content,
  tokensIn: messageVariants.tokensIn,
  tokensOut: messageVariants.tokensOut,
  costUsd: messageVariants.costUsd,
  cacheReadTokens: messageVariants.cacheReadTokens,
  cacheWriteTokens: messageVariants.cacheWriteTokens,
  contextWindow: messageVariants.contextWindow,
  genStartedAt: messageVariants.genStartedAt,
  genFinishedAt: messageVariants.genFinishedAt,
  model: messageVariants.model,
  provider: messageVariants.provider,
  reasoning: messageVariants.reasoning,
  metadata: messageVariants.metadata,
  selectedIdx: messageVariants.idx,
  variantCount: sql<number>`(select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${messages.id})`,
} as const;

/** The stats-contribution rows (slot ⋈ selected variant) for a set of slots in one chat — the
 *  delete-messages delta input. Chat-scoped: a foreign id from another chat matches nothing. */
export async function loadCanonStatRows(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): Promise<CanonStatRow[]> {
  return await db
    .select(canonStatSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds])));
}

/** The non-selected variants (swipes) of a slot set, joined to the slot's attribution — the
 *  delete-messages swipe-delta input. */
export async function loadSwipeStatRows(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): Promise<SwipeStatRow[]> {
  return await db
    .select({
      messageId: messageVariants.messageId,
      characterId: messages.characterId,
      msgCreatedAt: messages.createdAt,
      content: messageVariants.content,
      tokensIn: messageVariants.tokensIn,
      tokensOut: messageVariants.tokensOut,
      genStartedAt: messageVariants.genStartedAt,
      genFinishedAt: messageVariants.genFinishedAt,
      model: messageVariants.model,
      provider: messageVariants.provider,
      reasoning: messageVariants.reasoning,
      metadata: messageVariants.metadata,
    })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messages.chatId, chatId), inArray(messageVariants.messageId, [...messageIds]), ne(messageVariants.id, messages.selectedVariantId)));
}

// The append-variant/continue write target — the slot's attribution + seq joined to its selected
// variant's current content/idx.
const slotTargetSelection = {
  messageId: messages.id,
  seq: messages.seq,
  role: messages.role,
  characterId: messages.characterId,
  authorUserId: messages.authorUserId,
  personaId: messages.personaId,
  selectedVariantId: messageVariants.id,
  selectedVariantIdx: messageVariants.idx,
  content: messageVariants.content,
  reasoning: messageVariants.reasoning,
  variantCount: sql<number>`(select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${messages.id})`,
} as const;

/** The write target for a swipe (`append-variant`) / `continue`. */
interface SlotTarget {
  messageId: MessageId;
  seq: number;
  role: MessageRole;
  characterId: CharacterId | null;
  authorUserId: UserId | null;
  personaId: PersonaId | null;
  selectedVariantId: MessageVariantId;
  selectedVariantIdx: number;
  content: string;
  reasoning: string | null;
  variantCount: number;
}

/** The continue-undo snapshot of a slot's selected variant. */
interface ContinueSnapshot {
  variantId: MessageVariantId;
  preContinueContent: string | null;
  preContinueReasoning: string | null;
  lastContinuationContent: string | null;
  lastContinuationReasoning: string | null;
}

/** The write target for a swipe/`continue` — the slot's seq + attribution + its selected variant's current
 *  state. Chat-scoped (`id AND chatId`) so a foreign-chat `messageId` matches nothing. `undefined` ⇒ no
 *  such committed slot in this chat. */
export async function loadSlotTarget(db: Db, chatId: ChatId, messageId: MessageId): Promise<SlotTarget | undefined> {
  const rows = await db
    .select(slotTargetSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** The continue-undo snapshot for a slot's selected variant. All-null ⇒ never continued (undo/revert
 *  refuse `no_continuation`). Chat-scoped (`id AND chatId`); `undefined` ⇒ no such slot in this chat. */
export async function loadContinueSnapshot(db: Db, chatId: ChatId, messageId: MessageId): Promise<ContinueSnapshot | undefined> {
  const rows = await db
    .select({
      variantId: messageVariants.id,
      preContinueContent: messageVariants.preContinueContent,
      preContinueReasoning: messageVariants.preContinueReasoning,
      lastContinuationContent: messageVariants.lastContinuationContent,
      lastContinuationReasoning: messageVariants.lastContinuationReasoning,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** A backwards page of canon — slot ⋈ selected-variant rows strictly before `beforeSeq` (absent ⇒ from
 *  the tail), newest-first, capped at `limit`. The verb reverses for chronological display. */
export async function loadMessagesPage(db: Db, chatId: ChatId, beforeSeq?: number, limit: number = DEFAULT_PAGE_LIMIT): Promise<MessageView[]> {
  const where = beforeSeq === undefined ? eq(messages.chatId, chatId) : and(eq(messages.chatId, chatId), lt(messages.seq, beforeSeq));
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(where)
    .orderBy(desc(messages.seq))
    .limit(limit);
}

// ── stream-log / bus-log replay + cursor reads ─────────────────────────────────

/** Resume the resumable SSE token log — every row strictly after `afterSeq` (absent ⇒ from the retained
 *  window start), oldest-first. */
export async function loadStreamReplay(db: Db, chatId: ChatId, afterSeq?: number): Promise<ChatStreamReplayEvent[]> {
  const where = afterSeq === undefined ? eq(chatStreamEvents.chatId, chatId) : and(eq(chatStreamEvents.chatId, chatId), gt(chatStreamEvents.seq, afterSeq));
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

/** The resumable SSE log's replay cursor bounds — min/max `seq` (null/null when empty). */
export async function loadStreamBounds(db: Db, chatId: ChatId): Promise<StreamEventBounds> {
  const rows = await db
    .select({ minSeq: min(chatStreamEvents.seq), maxSeq: max(chatStreamEvents.seq) })
    .from(chatStreamEvents)
    .where(eq(chatStreamEvents.chatId, chatId));
  const r = rows.at(0);
  return { minSeq: r?.minSeq ?? null, maxSeq: r?.maxSeq ?? null };
}

/** Replay the durable chat-bus log — every row strictly after `afterSeq` (absent ⇒ from the start),
 *  oldest-first, the full room-public payload. */
export async function loadChatEventReplay(db: Db, chatId: ChatId, afterSeq?: number): Promise<ChatEventLogRow[]> {
  const where = afterSeq === undefined ? eq(chatEvents.chatId, chatId) : and(eq(chatEvents.chatId, chatId), gt(chatEvents.seq, afterSeq));
  return await db.select({ seq: chatEvents.seq, payload: chatEvents.payload }).from(chatEvents).where(where).orderBy(asc(chatEvents.seq));
}

/** The durable chat-bus log's cursor bounds — min/max `seq` (null/null when empty); `maxSeq` is the
 *  `lastEventId` a fresh subscriber resumes from. */
export async function loadChatEventBounds(db: Db, chatId: ChatId): Promise<StreamEventBounds> {
  const rows = await db
    .select({ minSeq: min(chatEvents.seq), maxSeq: max(chatEvents.seq) })
    .from(chatEvents)
    .where(eq(chatEvents.chatId, chatId));
  const r = rows.at(0);
  return { minSeq: r?.minSeq ?? null, maxSeq: r?.maxSeq ?? null };
}

/** The full sibling-variant set for one slot, ordered by `idx` ascending — just enough to resolve an idx
 *  to its variant id. Chat-scoped via the `messages` join: a foreign-chat `messageId` matches nothing, so
 *  the verb collapses an empty result to a leak-free NOT_FOUND. */
export async function loadMessageVariantSummaries(db: Db, chatId: ChatId, messageId: MessageId): Promise<{ variantId: MessageVariantId; idx: number }[]> {
  return await db
    .select({ variantId: messageVariants.id, idx: messageVariants.idx })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageVariants.messageId, messageId)))
    .orderBy(asc(messageVariants.idx));
}

/** The owning slot of a variant (`selectVariant` ownership belt). Returns the variant's `messageId`, or
 *  `undefined` for an unknown variant; the verb verifies it equals the target slot before flipping the
 *  pointer. */
export async function loadVariantMessageId(db: Db, variantId: MessageVariantId): Promise<MessageId | undefined> {
  const rows = await db.select({ messageId: messageVariants.messageId }).from(messageVariants).where(eq(messageVariants.id, variantId)).limit(LIMIT_ONE);
  return rows.at(0)?.messageId;
}

/** Every slot's `(id, seq)` for a chat, ascending — the `moveMessage` re-sequence input. */
export async function loadMessageSeqs(db: Db, chatId: ChatId): Promise<{ id: MessageId; seq: number }[]> {
  return await db.select({ id: messages.id, seq: messages.seq }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
}

/** The canon history strictly after `afterSeq` (the compaction window). Slot ⋈ selected-variant, oldest-first. */
export async function loadCanonHistoryAfter(db: Db, chatId: ChatId, afterSeq: number): Promise<MessageView[]> {
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), gt(messages.seq, afterSeq)))
    .orderBy(asc(messages.seq));
}

/** One entry in the runtime-variable fold source: a message's `seq` + the selected variant's parsed delta. */
interface VariableDeltaRow {
  readonly seq: number;
  readonly messageId: MessageId;
  readonly delta: readonly VarOp[];
}

/** The per-variant variable deltas along the selected-variant chain, seq-ordered. Each `variable_delta` is
 *  parsed at the read seam; a malformed blob degrades to `[]`, never throws. */
export async function loadVariableDeltas(db: Db, chatId: ChatId): Promise<VariableDeltaRow[]> {
  const rows = await db
    .select({
      seq: messages.seq,
      messageId: messages.id,
      variableDelta: messageVariants.variableDelta,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
  return rows.map((r) => {
    const parsed = variableDeltaSchema.safeParse(r.variableDelta);
    return { seq: r.seq, messageId: r.messageId, delta: parsed.success ? parsed.data : [] };
  });
}

/** One variant's parsed `variable_delta` (the `selectVariant` re-fold). A malformed/absent blob degrades
 *  to `[]`. */
export async function loadVariantDelta(db: Db, variantId: MessageVariantId): Promise<readonly VarOp[]> {
  const rows = await db
    .select({ variableDelta: messageVariants.variableDelta })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId))
    .limit(LIMIT_ONE);
  const parsed = variableDeltaSchema.safeParse(rows.at(0)?.variableDelta);
  return parsed.success ? parsed.data : [];
}

/** The persisted per-chat ChoiceBlock variable flush. Null ⇒ nothing flushed yet (the verb returns `{}`). */
export async function loadStoredVariables(db: Db, chatId: ChatId): Promise<Record<string, string> | null> {
  const rows = await db.select({ variableValues: chats.variableValues }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  return rows.at(0)?.variableValues ?? null;
}

/** The persisted positional injections for a chat. Full rows, ordered by depth then the within-depth
 *  `order` then insert order (a deterministic, splice-ready read). */
export async function loadChatInjections(db: Db, chatId: ChatId): Promise<(typeof chatInjections.$inferSelect)[]> {
  return await db
    .select()
    .from(chatInjections)
    .where(eq(chatInjections.chatId, chatId))
    .orderBy(asc(chatInjections.depth), asc(chatInjections.order), asc(chatInjections.createdAt));
}

/** The full message slot rows for a fork copy, oldest-first, optionally truncated at `throughSeq`. Raw
 *  `$inferSelect` rows so the fork can spread→re-id every column; the verb mints fresh ids + remaps the
 *  selected-variant pointer. */
export async function loadMessageSlots(db: Db, chatId: ChatId, throughSeq?: number): Promise<(typeof messages.$inferSelect)[]> {
  const where = throughSeq === undefined ? eq(messages.chatId, chatId) : and(eq(messages.chatId, chatId), lte(messages.seq, throughSeq));
  return await db.select().from(messages).where(where).orderBy(asc(messages.seq));
}

/** Every variant (swipe) for a set of slots (the fork copy — every variant, not just the selected one). */
export async function loadVariantsByMessageIds(db: Db, messageIds: readonly MessageId[]): Promise<(typeof messageVariants.$inferSelect)[]> {
  if (messageIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(messageVariants)
    .where(inArray(messageVariants.messageId, [...messageIds]))
    .orderBy(asc(messageVariants.idx));
}
