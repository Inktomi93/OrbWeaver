// domain/chat/persistence/queries — QUERIES ONLY. The
// membership-scoped chat-row reads (D18 — `loadMemberChat` replaces neo's `loadOwnedChat`; there is no
// `chats.ownerId`, the host is just a `chat_participants` row), the D26 canon reads (slot ⋈ selected-variant),
// and the durable chat-bus + resumable SSE stream-log replay/cursor reads. NO business logic, NO cross-feature
// calls, NO I/O beyond `db`. The agent-sdk frame readers LEAVE to providers (movement table) — not here.
//
// THE ONE JSON-PARSE BOUNDARY: `chats.metadata` is read through `parseChatMetadata` (the contract's
// fault-isolated lazy parser — reused, never re-spelled). Every other column is trusted (db CHECK/FK enforced).
//
// `users` is NEVER joined here (the `no-direct-users-read` chokepoint — admin + sessions are the only sanctioned `users` readers): roster name/handle
// resolution is a verb concern (it takes ids from the resolved Principal + injected ops); persistence returns
// the raw membership-scoped rows. Row/return SHAPES are file-LOCAL (callers read the inferred return) so no
// feature type leaks out of `persistence/` (`types-in-contract`). Timestamps/cursors arrive as PARAMS.

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import {
  chatEvents,
  chatInjections,
  chatParticipants,
  chatStreamEvents,
  chats,
  messages,
  messageVariants,
} from "@orb/db";
import type {
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  max,
  min,
  ne,
  sql,
} from "drizzle-orm";
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

/** Read the chat's pending host-handoff nominee (the two-party carrier — Part III §2). Returns the nominee
 *  `userId` or null (no pending nomination). `acceptHostHandoff` reads this to verify the caller IS the
 *  nominee before the atomic role swap (the self-promotion belt). */
export async function loadPendingHostUserId(db: Db, chatId: ChatId): Promise<UserId | null> {
  const rows = await db
    .select({ pendingHostUserId: chats.pendingHostUserId })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  return rows.at(0)?.pendingHostUserId ?? null;
}

/**
 * The membership-scoped chat read (D18 — replaces neo's `loadOwnedChat`): the chat row joined to the CALLER's
 * PRESENT participant row (`leftSeq IS NULL`), returning the row (metadata parsed) + the caller's `role`
 * (`host|member`). `undefined` ⇒ no such chat OR the caller is not a present member — the two collapse into one
 * leak-free answer (the verb maps it to `ChatNotFoundError`). The host is just a
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
 *  unless `includeArchived`; TEMPORARY chats are ALWAYS hidden (ST "Temporary Chat", PD-65 — they persist
 *  so turns can run, but never surface in the library; `reapTemporaryChats` sweeps them once expired).
 *  Name/preview resolution (`participantNames`) is the verb's (no `users` join). */
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
  const scoped = includeArchived
    ? base.where(eq(chats.temporary, false))
    : base.where(and(eq(chats.archived, false), eq(chats.temporary, false)));
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

/** Per-chat canon aggregates for the `ChatSummary` list chrome (listChats / listForks / getChatLineage):
 *  the message COUNT + the newest message timestamp (`lastMessageAt`). Batched over a set of ids (one GROUP
 *  BY, no N+1); a chat with NO messages is simply ABSENT from the map (the verb defaults it to `{0, null}`).
 *  No-op (empty map) on an empty id list. */
export async function loadChatMessageStats(
  db: Db,
  chatIds: readonly ChatId[],
): Promise<Map<ChatId, { messageCount: number; lastMessageAt: number | null }>> {
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

/** Walk the fork-lineage chain (D27 `parentChatId` self-FK) from `chatId` UP to its root — UNSCOPED (membership
 *  is gated per-ancestor by the verb; a fork grants NO parent membership — inv §16). Returns the rows SELF-first
 *  (self → parent → … → root); the verb reverses to root-first + redacts the ancestors the caller can't see. A
 *  `visited` set + `maxDepth` cap defend against a (schema-impossible) cycle / pathological depth. */
export async function loadAncestorChain(db: Db, chatId: ChatId, maxDepth = 64): Promise<ChatRow[]> {
  const chain: ChatRow[] = [];
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

/** ONE slot ⋈ its selected variant (the `MessageView` for a single message). The engine re-reads this after an
 *  append-variant / continue commit (the authoritative `variantCount`/`selectedVariantIdx`/content the write
 *  produced); undo/revert re-read it for the returned view. `undefined` ⇒ no such committed slot. */
export async function loadMessageView(
  db: Db,
  messageId: MessageId,
): Promise<MessageView | undefined> {
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

// ── The stats-delta canon reads (the delete-messages arm — the canon-mutator mandate). Full rows so
// the signed deltas mirror the rebuild's streams column-for-column (drift gate). File-local shapes. ──

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

/** The stats-contribution rows (slot ⋈ SELECTED variant, the rebuild's message-stream fields) for a set of
 *  slots in one chat — the delete-messages delta input. Chat-scoped (defense-in-depth: a foreign id from
 *  another chat matches nothing). Callers read the inferred return (file-local shape). */
export async function loadCanonStatRows(
  db: Db,
  chatId: ChatId,
  messageIds: readonly MessageId[],
): Promise<CanonStatRow[]> {
  return await db
    .select(canonStatSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds])));
}

/** The NON-selected variants (swipes) of a slot set, joined to the slot's attribution — the rebuild's
 *  swipe-stream fields (the delete-messages swipe-delta input). Inferred return (file-local shape). */
export async function loadSwipeStatRows(
  db: Db,
  chatId: ChatId,
  messageIds: readonly MessageId[],
): Promise<SwipeStatRow[]> {
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
    .where(
      and(
        eq(messages.chatId, chatId),
        inArray(messageVariants.messageId, [...messageIds]),
        ne(messageVariants.id, messages.selectedVariantId),
      ),
    );
}

// The append-variant / continue write TARGET — the slot's attribution + seq (for canon truncation) joined to
// its SELECTED variant's current content/idx (for the next swipe idx + the continue base). File-local shape.
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

/** The write target for a swipe (`append-variant`) / `continue` (file-local — `types-in-contract`). */
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

/** The continue-undo snapshot of a slot's selected variant (file-local). */
interface ContinueSnapshot {
  variantId: MessageVariantId;
  preContinueContent: string | null;
  preContinueReasoning: string | null;
  lastContinuationContent: string | null;
  lastContinuationReasoning: string | null;
}

/** The write target for a swipe (`append-variant`) / `continue` — the slot's seq + attribution + its selected
 *  variant's current state. `variantCount` is the next swipe's `idx`; `content`/`reasoning` are the continue
 *  base. `undefined` ⇒ no such committed slot (the verb maps it to a leak-free NOT_FOUND). */
export async function loadSlotTarget(
  db: Db,
  messageId: MessageId,
): Promise<SlotTarget | undefined> {
  const rows = await db
    .select(slotTargetSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** The continue-undo snapshot for a slot's SELECTED variant (D26 `preContinue*`/`lastContinuation*`). All-null
 *  ⇒ the variant was never continued (undo/revert refuse `no_continuation`). `undefined` ⇒ no such slot. */
export async function loadContinueSnapshot(
  db: Db,
  messageId: MessageId,
): Promise<ContinueSnapshot | undefined> {
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
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  return rows.at(0);
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

// ── chunk-13 reads: canon-edit ownership / move · compaction window · variables · injections · fork-copy ──

/** The owning slot of a variant (`selectVariant` ownership belt — D26: a `selectedVariantId` may only point
 *  at a SIBLING of the slot). Returns the variant's `messageId`, or `undefined` for an unknown variant; the
 *  verb verifies it equals the target slot before flipping the pointer (never selects a foreign chat's swipe). */
export async function loadVariantMessageId(
  db: Db,
  variantId: MessageVariantId,
): Promise<MessageId | undefined> {
  const rows = await db
    .select({ messageId: messageVariants.messageId })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId))
    .limit(LIMIT_ONE);
  return rows.at(0)?.messageId;
}

/** Every slot's `(id, seq)` for a chat, ascending (the `moveMessage` re-sequence input — the verb computes
 *  the range-shift plan from this). File-local row shape. */
export async function loadMessageSeqs(
  db: Db,
  chatId: ChatId,
): Promise<{ id: MessageId; seq: number }[]> {
  return await db
    .select({ id: messages.id, seq: messages.seq })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
}

/** The canon history STRICTLY AFTER `afterSeq` (the compaction window — D25: a manual/engine compaction
 *  summarizes `seq > compactedAtSeq` and advances the checkpoint). Slot ⋈ selected-variant, oldest-first. */
export async function loadCanonHistoryAfter(
  db: Db,
  chatId: ChatId,
  afterSeq: number,
): Promise<MessageView[]> {
  return await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), gt(messages.seq, afterSeq)))
    .orderBy(asc(messages.seq));
}

/** The persisted per-chat ChoiceBlock variable flush (`getStoredVariables` + the fork copy — D46 config
 *  plane). Null ⇒ nothing flushed yet (the verb returns `{}`). */
export async function loadStoredVariables(
  db: Db,
  chatId: ChatId,
): Promise<Record<string, string> | null> {
  const rows = await db
    .select({ variableValues: chats.variableValues })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  return rows.at(0)?.variableValues ?? null;
}

/** The persisted positional injections for a chat (`listChatInjections` + the fork copy). Full rows, ordered
 *  by depth then the within-depth `order` then insert order (a deterministic, splice-ready read). */
export async function loadChatInjections(
  db: Db,
  chatId: ChatId,
): Promise<(typeof chatInjections.$inferSelect)[]> {
  return await db
    .select()
    .from(chatInjections)
    .where(eq(chatInjections.chatId, chatId))
    .orderBy(asc(chatInjections.depth), asc(chatInjections.order), asc(chatInjections.createdAt));
}

/** The full message SLOT rows for a fork copy (D27 deep copy), oldest-first, optionally truncated at
 *  `throughSeq` (absent ⇒ the whole chat). Raw `$inferSelect` rows so the fork can spread→re-id every column
 *  (no field drift); the verb mints fresh ids + remaps the selected-variant pointer. */
export async function loadMessageSlots(
  db: Db,
  chatId: ChatId,
  throughSeq?: number,
): Promise<(typeof messages.$inferSelect)[]> {
  const where =
    throughSeq === undefined
      ? eq(messages.chatId, chatId)
      : and(eq(messages.chatId, chatId), lte(messages.seq, throughSeq));
  return await db.select().from(messages).where(where).orderBy(asc(messages.seq));
}

/** Every variant (swipe) for a set of slots (the fork copy — D27 copies EVERY variant, not just the selected
 *  one). Raw `$inferSelect` rows for the spread→re-id copy. No-op (empty) on an empty id list. */
export async function loadVariantsByMessageIds(
  db: Db,
  messageIds: readonly MessageId[],
): Promise<(typeof messageVariants.$inferSelect)[]> {
  if (messageIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(messageVariants)
    .where(inArray(messageVariants.messageId, [...messageIds]))
    .orderBy(asc(messageVariants.idx));
}
