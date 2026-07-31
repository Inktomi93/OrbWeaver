// domain/chat/persistence/queries — QUERIES ONLY: membership-scoped chat-row reads, canon reads (slot ⋈
// selected-variant), and durable chat-bus + resumable SSE stream-log replay/cursor reads. No business
// logic, no cross-feature calls, no I/O beyond `db`. `chats.metadata` is read only through
// `parseChatMetadata`. `users` is never joined here — roster name/handle resolution is a verb concern.

import type {
  ChatBusEvent,
  JoinHistoryVisibility,
  MessageView,
  StandaloneVariableDelta,
  ToolCallRecord,
  TurnOrigin,
  UserMacroDraws,
} from "@orb/contracts/chat";
import { standaloneVariableDeltasSchema, toolCallRecordSchema, userMacroDrawsSchema, variableDeltaSchema } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { UserMacroValues } from "@orb/contracts/preset";
import { userMacroValuesSchema } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatEvents, chatInjections, chatParticipants, chatStreamEvents, chats, messages, messageVariants, notStateAnchor } from "@orb/db";
import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, max, min, ne, sql } from "drizzle-orm";
import type { ChatMetadata } from "../contract/metadata";
import { parseChatMetadata } from "../contract/metadata";
import type { ChatStreamReplayEvent, StreamEventBounds } from "../contract/views";

const LIMIT_ONE = 1;

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
  // The selected variant's D26 continue snapshot presence (both content columns set) → the client's
  // undo/revert phase-gate. SQLite has no bool; emit 1/0 and coerce in `toMessageView`.
  hasContinuation: sql<number>`(case when ${messageVariants.preContinueContent} is not null and ${messageVariants.lastContinuationContent} is not null then 1 else 0 end)`,
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
  // Raw JSON blob — parsed at the read seam by `toMessageView` (never the drizzle `$type` cast).
  toolCalls: messageVariants.toolCalls,
} as const;

const toolCallsSchema = toolCallRecordSchema.array();

// The `messageViewSelection` row → `MessageView`: every scalar column mirrors the view 1:1; the sole
// re-map is the `toolCalls` JSON blob, safeParsed with `toolCallRecordSchema` (the `variableDelta` read
// seam pattern — a malformed/absent blob degrades to `[]`, never throws, never a cast). The client's ONLY
// tool read surface (tool-use-design/03 §3–4).
function toMessageView(
  row: Omit<MessageView, "toolCalls" | "hasContinuation"> & { toolCalls: readonly ToolCallRecord[] | null; hasContinuation: number },
): MessageView {
  const parsed = toolCallsSchema.safeParse(row.toolCalls);
  return { ...row, hasContinuation: row.hasContinuation === 1, toolCalls: parsed.success ? parsed.data : [] };
}

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
 * the row + the caller's `role` + `activePersonaId` (the attribution fallback for un-stamped sends) + the
 * caller's OWN join horizon (`joinSeq` + `joinHistoryVisibility` — the D16 confidentiality policy the guard
 * turns into a canon read floor; loaded HERE so the chokepoint needs no second query).
 * `undefined` ⇒ no such chat OR the caller is not a present member (collapsed into one leak-free answer).
 */
export async function loadMemberChat(
  db: Db,
  chatId: ChatId,
  userId: UserId,
): Promise<
  | {
      chat: ChatRow;
      role: ParticipantRole;
      activePersonaId: PersonaId | null;
      joinSeq: number;
      joinHistoryVisibility: JoinHistoryVisibility;
    }
  | undefined
> {
  const rows = await db
    .select({
      ...chatRowSelection,
      role: chatParticipants.role,
      activePersonaId: chatParticipants.activePersonaId,
      joinSeq: chatParticipants.joinSeq,
      joinHistoryVisibility: chatParticipants.joinHistoryVisibility,
    })
    .from(chats)
    .innerJoin(chatParticipants, and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const r = rows.at(0);
  if (r === undefined) {
    return;
  }
  const { role, activePersonaId, joinSeq, joinHistoryVisibility, ...rest } = r;
  return { chat: toChatRow(rest), role, activePersonaId, joinSeq, joinHistoryVisibility };
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
 *  over a set of ids (one GROUP BY, no N+1); a chat with no messages is absent from the map.
 *
 *  VISIBLE rows only. The join to the selected variant + `notStateAnchor` excludes rpg state-anchor slots —
 *  the empty-body snapshot keys `resyncFromStory`/`editSnapshot` post. They are not messages, so they must
 *  neither be counted (the owner's dogfood chat read "7 messages" over 3 real ones, 2026-07-31) nor bump
 *  `lastMessageAt` (a silent state write is not a beat, and this field is the library's recency sort). The
 *  join is the SAME `innerJoin` every canon read does, so it drops nothing a reader could see. */
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
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(inArray(messages.chatId, [...chatIds]), notStateAnchor()))
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

/** The text of the latest user-role message's selected variant, or `null` (no user line yet). The rpg
 *  `skill_check` re-reads this server-side to feed the player's queued d20 (rpg-design/05 §6) — the pending
 *  user text the AI GM turn is responding to. `role='user'` scopes it to human sends (never a narrator/assistant
 *  line); newest by `seq`. */
export async function loadPendingUserText(db: Db, chatId: ChatId): Promise<string | null> {
  const rows = await db
    .select({ text: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user")))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  return rows.at(0)?.text ?? null;
}

/** Slot-adjacency for the rpg dice feed-forward (rpg-design/05 §6): does the `targetMessageId` slot DIRECTLY
 *  respond to the latest user message — i.e. is it the FIRST message after the latest user-role message (nothing
 *  committed between them)? True for a swipe/regen of the die-response; false for a swipe of an older slot or when
 *  a later assistant turn already sits after the die. `false` when the chat has no user message or no such slot. */
export async function loadIsReplyToLatestUserMessage(db: Db, chatId: ChatId, targetMessageId: MessageId): Promise<boolean> {
  const userRows = await db
    .select({ seq: max(messages.seq) })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user")));
  const latestUserSeq = userRows.at(0)?.seq ?? null;
  if (latestUserSeq === null) {
    return false;
  }
  const firstAfterRows = await db
    .select({ seq: min(messages.seq) })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), gt(messages.seq, latestUserSeq)));
  const firstAfterSeq = firstAfterRows.at(0)?.seq ?? null;
  if (firstAfterSeq === null) {
    return false;
  }
  const targetRows = await db
    .select({ seq: messages.seq })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, targetMessageId)))
    .limit(LIMIT_ONE);
  return targetRows.at(0)?.seq === firstAfterSeq;
}

/** The full canon history for a chat (assembly's substrate), oldest→newest, each slot joined to its
 *  selected variant. Includes excluded/hidden slots (`excludedFromPrompt` rides each row; assembly filters). */
export async function loadCanonHistory(db: Db, chatId: ChatId): Promise<MessageView[]> {
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.seq));
  return rows.map(toMessageView);
}

/** One slot ⋈ its selected variant. The engine re-reads this after an append-variant/continue commit;
 *  undo/revert re-read it for the returned view. `undefined` ⇒ no such committed slot. */
/** The expressions post-turn read (expressions-design/02 §3.1) — ONE committed variant's speaker + POST-regex
 *  visible prose, scoped by `(chatId, messageId, variantId)`. The variant's `content` is ALREADY the
 *  receive-tier-regex'd canon (the pipeline applies AI_OUTPUT scripts before persisting — this exposes the
 *  stored projection, never re-runs regex). `speakerCharacterId` is the SLOT's `characterId` (D26 — null for a
 *  user/persona/narrator/agent turn, i.e. no sprite target). `null` ⇒ the variant vanished (deleted
 *  mid-flight) or the ids don't belong together. */
export async function loadTurnForClassify(
  db: Db,
  chatId: ChatId,
  messageId: MessageId,
  variantId: MessageVariantId,
): Promise<{ speakerCharacterId: CharacterId | null; text: string } | null> {
  const rows = await db
    .select({ speakerCharacterId: messages.characterId, text: messageVariants.content })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messageVariants.id, variantId), eq(messageVariants.messageId, messageId), eq(messages.chatId, chatId)))
    .limit(LIMIT_ONE);
  return rows.at(0) ?? null;
}

export async function loadMessageView(db: Db, messageId: MessageId): Promise<MessageView | undefined> {
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  const r = rows.at(0);
  return r === undefined ? undefined : toMessageView(r);
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
  // Raw JSON — parsed (safeParse-degrade) into `SlotTarget.macroDraws` by `loadSlotTarget`, never surfaced raw.
  macroDraws: messageVariants.macroDraws,
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
  /** The slot's selected variant's persisted user-macro draw record (WAVE MU) — the swipe/continue path
   *  replays it as kit's `frozenDraws`. `null` on a pre-feature variant OR a malformed blob (safeParse
   *  degrade — never a throw); a fresh draw then happens and is recorded onto the new variant. */
  macroDraws: UserMacroDraws | null;
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
  const row = rows.at(0);
  if (row === undefined) {
    return;
  }
  // Parse the draw record at the read seam (never surface raw JSON) — a malformed blob degrades to null,
  // so a swipe/continue of it draws fresh rather than throwing (the `variableDelta` degrade precedent).
  const parsedDraws = userMacroDrawsSchema.safeParse(row.macroDraws);
  return { ...row, macroDraws: parsedDraws.success ? parsedDraws.data : null };
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
 *  the tail) and at/above `floorSeq`, newest-first, capped at `limit`. The verb reverses for chronological
 *  display. `floorSeq` is the CALLER's D16 join-history floor (`substrate/auth::resolveHistoryFloorSeq`,
 *  stamped by the guard); it is REQUIRED, not defaulted, so a new paginated caller cannot forget it. A
 *  `beforeSeq` cursor at/below the floor yields an EMPTY page — SQL, never a fabricated one. */
export async function loadMessagesPage(
  db: Db,
  chatId: ChatId,
  window: { readonly beforeSeq: number | undefined; readonly limit: number; readonly floorSeq: number },
): Promise<MessageView[]> {
  const { beforeSeq, limit, floorSeq } = window;
  const where = and(eq(messages.chatId, chatId), gte(messages.seq, floorSeq), beforeSeq === undefined ? undefined : lt(messages.seq, beforeSeq));
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(where)
    .orderBy(desc(messages.seq))
    .limit(limit);
  return rows.map(toMessageView);
}

// ── stream-log / bus-log replay + cursor reads ─────────────────────────────────

/** Resume the resumable SSE token log — every row strictly after `afterSeq` (absent ⇒ from the retained
 *  window start), oldest-first, clamped to the caller's D16 join-history `floorSeq`.
 *
 *  A stream row is raw transcript text; its only canon anchor is the nullable `messageId` column. A clamped
 *  caller (`floorSeq > 0`) therefore gets an INNER JOIN to `messages` with `seq >= floorSeq` — the row-level
 *  equivalent of the `slotSeq` compare `substrate/auth::isBelowHistoryFloor` runs on a `delta` bus event. The
 *  join by construction also drops turn-level rows whose slot had not committed yet (`messageId IS NULL` —
 *  anchorless HERE, unlike the bus `delta`, whose anchor is stamped by the emit site rather than read back
 *  from a column, so those stay conservatively withheld).
 *  An unclamped caller takes the plain read (no join, byte-identical to before). */
export async function loadStreamReplay(db: Db, chatId: ChatId, afterSeq: number | undefined, floorSeq: number): Promise<ChatStreamReplayEvent[]> {
  const selection = {
    seq: chatStreamEvents.seq,
    messageId: chatStreamEvents.messageId,
    kind: chatStreamEvents.kind,
    delta: chatStreamEvents.delta,
  } as const;
  const where = and(eq(chatStreamEvents.chatId, chatId), afterSeq === undefined ? undefined : gt(chatStreamEvents.seq, afterSeq));
  if (floorSeq <= 0) {
    return await db.select(selection).from(chatStreamEvents).where(where).orderBy(asc(chatStreamEvents.seq));
  }
  return await db
    .select(selection)
    .from(chatStreamEvents)
    .innerJoin(messages, eq(messages.id, chatStreamEvents.messageId))
    .where(and(where, gte(messages.seq, floorSeq)))
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
  const rows = await db
    .select(messageViewSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), gt(messages.seq, afterSeq)))
    .orderBy(asc(messages.seq));
  return rows.map(toMessageView);
}

/** One entry in the runtime-variable fold source: a `seq` + the parsed delta. `messageId` is the slot for a
 *  per-variant message delta, or `null` for a STANDALONE (out-of-turn) delta batch — which carries no slot,
 *  so the fold mutators' by-`messageId` override/filter/remap pass it through untouched (03 §1.1). */
interface VariableDeltaRow {
  readonly seq: number;
  readonly messageId: MessageId | null;
  readonly delta: readonly VarOp[];
}

/** The chat's standalone (out-of-turn) runtime-variable delta batches (`chats.standalone_variable_deltas`,
 *  03 §1.1), seq-ordered as stored. Parsed at the read seam; a malformed blob degrades to `[]`, never throws. */
export async function loadStandaloneVariableDeltas(db: Db, chatId: ChatId): Promise<StandaloneVariableDelta[]> {
  const rows = await db.select({ standaloneVariableDeltas: chats.standaloneVariableDeltas }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  const parsed = standaloneVariableDeltasSchema.safeParse(rows.at(0)?.standaloneVariableDeltas);
  return parsed.success ? parsed.data : [];
}

/** The runtime-cache fold SOURCE, seq-ordered: the per-variant message deltas along the selected-variant
 *  chain UNIONED with the chat's standalone (out-of-turn) delta batches (03 §1.1). Each blob is parsed at the
 *  read seam; a malformed blob degrades to `[]`, never throws. `foldChain` re-sorts by `seq`, so the two
 *  sources interleave in real-apply order (a standalone stamped at maxSeq folds after that message, before
 *  the next turn's). */
export async function loadVariableDeltas(db: Db, chatId: ChatId): Promise<VariableDeltaRow[]> {
  const [rows, standalone] = await Promise.all([
    db
      .select({
        seq: messages.seq,
        messageId: messages.id,
        variableDelta: messageVariants.variableDelta,
      })
      .from(messages)
      .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.seq)),
    loadStandaloneVariableDeltas(db, chatId),
  ]);
  const messageEntries: VariableDeltaRow[] = rows.map((r) => {
    const parsed = variableDeltaSchema.safeParse(r.variableDelta);
    return { seq: r.seq, messageId: r.messageId, delta: parsed.success ? parsed.data : [] };
  });
  return [...messageEntries, ...standalone.map((s): VariableDeltaRow => ({ seq: s.seq, messageId: null, delta: s.delta }))];
}

/** The turn origin stamped on a reply SLOT (03 §4) — the `getTurnOrigin` read backing the automation cascade
 *  guard's depth counter. Chat-scoped: a `messageId` from another chat matches nothing (`null`). */
export async function loadTurnOrigin(db: Db, chatId: ChatId, messageId: MessageId): Promise<TurnOrigin | null> {
  const rows = await db
    .select({ initiator: messages.initiator, automationDepth: messages.automationDepth })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.id, messageId)))
    .limit(LIMIT_ONE);
  const row = rows.at(0);
  return row === undefined ? null : { initiator: row.initiator, automationDepth: row.automationDepth };
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

/** The persisted per-chat user-macro INPUT picks (WAVE MU) — the `values` bag the turn build feeds
 *  `buildTurnUserMacros`. Parsed at the read seam (`userMacroValuesSchema`, never cast); a malformed/absent
 *  blob degrades to `{}` (the defaults posture — unpicked inputs resolve their per-kind defaults). */
export async function loadStoredUserMacroValues(db: Db, chatId: ChatId): Promise<UserMacroValues> {
  const rows = await db.select({ userMacroValues: chats.userMacroValues }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  const parsed = userMacroValuesSchema.safeParse(rows.at(0)?.userMacroValues);
  return parsed.success ? parsed.data : {};
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

/** The full message slot rows for a fork copy, oldest-first, optionally truncated at `throughSeq` and
 *  floored at the FORKER's D16 join-history `floorSeq` (a fork COPIES canon into a room the forker hosts, so
 *  an unfloored copy would launder every row past the forker's own clamp). Raw `$inferSelect` rows so the
 *  fork can spread→re-id every column; the verb mints fresh ids + remaps the selected-variant pointer. */
export async function loadMessageSlots(db: Db, chatId: ChatId, throughSeq: number | undefined, floorSeq: number): Promise<(typeof messages.$inferSelect)[]> {
  const where = and(eq(messages.chatId, chatId), gte(messages.seq, floorSeq), throughSeq === undefined ? undefined : lte(messages.seq, throughSeq));
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
