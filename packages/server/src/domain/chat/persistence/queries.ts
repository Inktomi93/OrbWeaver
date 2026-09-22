// domain/chat/persistence/queries — QUERIES ONLY: membership-scoped chat-row reads, canon reads (slot ⋈
// selected-variant), and durable chat-bus + resumable SSE stream-log replay/cursor reads. No business
// logic, no cross-feature calls, no I/O beyond `db`. `chats.metadata` is read only through
// `parseChatMetadata`. `users` is never joined here — roster name/handle resolution is a verb concern.
//
// Chat search runs SERVER-SIDE: `characters` is joined by ONE predicate,
// the library-list search arm (`searchPredicate`), and only as a FILTER — no name is ever selected or
// returned from this file. That is the `persistence/identity.ts` shape, and it leaves the law above intact in
// the sense that matters: no display-name RESOLUTION happens here, and `users` is still never joined (which
// is why the search's name arm covers character seats and not human members — see `searchPredicate`).

import type {
  ChatBusEvent,
  ChatListCursor,
  ChatReasoningPart,
  HandoffOffer,
  JoinHistoryVisibility,
  MessageView,
  StandaloneVariableDelta,
  ToolCallRecord,
  TurnOrigin,
  UserMacroDraws,
  VariantMetadata,
} from "@orb/contracts/chat";
import {
  chatReasoningPartSchema,
  handoffOfferSchema,
  INLINE_REPLY_ORIGIN,
  macroFreezeRecordSchema,
  NO_HANDOFF_OFFER,
  parseVariantMetadata,
  sentPromptSchema,
  standaloneVariableDeltasSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  variableDeltaSchema,
} from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { UserMacroValues } from "@orb/contracts/preset";
import { userIntentSchema, userMacroValuesSchema } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { characters, chatEvents, chatInjections, chatParticipants, chatStreamEvents, chats, messageAssets, messages, messageVariants } from "@orb/db";
import { chatRecencyExpr, memberVisibleChatScope } from "@orb/db/kit";
import { HIDDEN_TAGS } from "@orb/kit/content";
import type { AssetId, CharacterId, ChatEventId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, exists, gt, gte, inArray, isNull, lt, lte, max, min, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { ChatMetadata } from "../contract/metadata.ts";
import { parseChatMetadata } from "../contract/metadata.ts";
import type { ChatStreamReplayEvent, StreamEventBounds, VariantWireView } from "../contract/views.ts";

const LIMIT_ONE = 1;

/** A SECOND handle on `chat_participants` for the per-character projection EXISTS — the library list already
 *  joins the table as the caller's own membership row, and re-naming it there would make the subquery
 *  correlate against that join instead of scanning the chat's seats. */
const characterSeats = alias(chatParticipants, "character_seats");

/** A resolved `chats` row with its `metadata` blob parsed. File-local: the verb maps it into the
 *  `ChatDetail`/`ChatSummary` view. */
interface ChatRow {
  id: ChatId;
  title: string | null;
  starred: boolean;
  archived: boolean;
  /** ST "Temporary Chat" (PD-65) — hidden from `listMemberChats`, swept once past the host's TTL. */
  temporary: boolean;
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
  starred: chats.starred,
  archived: chats.archived,
  temporary: chats.temporary,
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
  kind: messages.kind,
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
  tokenProvenance: messageVariants.tokenProvenance,
  cacheReadTokens: messageVariants.cacheReadTokens,
  cacheWriteTokens: messageVariants.cacheWriteTokens,
  contextWindow: messageVariants.contextWindow,
  contextBoundaryMessageId: messageVariants.contextBoundaryMessageId,
  costUsd: messageVariants.costUsd,
  costProvenance: messageVariants.costProvenance,
  ttftMs: messageVariants.ttftMs,
  genStartedAt: messageVariants.genStartedAt,
  genFinishedAt: messageVariants.genFinishedAt,
  generationId: messageVariants.generationId,
  connectionId: messageVariants.connectionId,
  // Raw JSON blob — parsed at the read seam by `toMessageView` (never the drizzle `$type` cast).
  toolCalls: messageVariants.toolCalls,
} as const;

const toolCallsSchema = toolCallRecordSchema.array();
const reasoningPartsSchema = chatReasoningPartSchema.array();

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

/** Read the chat's pending host-handoff NOMINATION — the nominee AND the property offer that qualifies it,
 *  as ONE value, because they are one nomination: `acceptHostHandoff` must never execute an offer without
 *  re-proving the nominee, and a second read could observe a re-nominate landing between them.
 *  `pendingHostUserId: null` ⇒ no pending handoff.
 *
 *  The offer blob is PARSED, not cast (the read-seam rule): a corrupt/absent blob degrades to
 *  {@link NO_HANDOFF_OFFER} — the accept then runs the built D64 drop rather than fabricating consent to
 *  copy someone's library out of unparseable bytes. */
export async function loadPendingHandoff(db: Db, chatId: ChatId): Promise<{ pendingHostUserId: UserId | null; offer: HandoffOffer }> {
  const rows = await db
    .select({ pendingHostUserId: chats.pendingHostUserId, pendingHandoffOffer: chats.pendingHandoffOffer })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const row = rows.at(0);
  return {
    pendingHostUserId: row?.pendingHostUserId ?? null,
    offer: handoffOfferSchema.catch(NO_HANDOFF_OFFER).parse(row?.pendingHandoffOffer ?? NO_HANDOFF_OFFER),
  };
}

/** The subset of `chatIds` whose pending host-handoff nomination is STILL OPEN and still names this user
 *  (#1799 — the second half of the read behind `InboxView.actionable`). `pending_host_user_id = :user` is
 *  both predicates at once: `acceptHostHandoff` CLEARS the column in the same statement that swaps the role,
 *  a re-nominate OVERWRITES it with someone else, and a host cancelling nulls it — so a nomination that was
 *  accepted, superseded or withdrawn is simply not in the answer, and a chat that named somebody else never
 *  was. A chat id the caller asked about and does not get back is settled, gone, or was never theirs: one
 *  indistinguishable answer, which is what keeps this read from being an existence oracle over other
 *  people's rooms. Empty `chatIds` short-circuits (`inArray` on an empty list is a SQL error). */
export async function selectStandingNominationChatIds(db: Db, nomineeUserId: UserId, chatIds: readonly ChatId[]): Promise<ChatId[]> {
  if (chatIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: chats.id })
    .from(chats)
    .where(and(inArray(chats.id, [...chatIds]), eq(chats.pendingHostUserId, nomineeUserId)));
  return rows.map((row) => row.id);
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

/** The library list's filter axes. File-local (the `ChatRow` precedent): the verb passes an object literal,
 *  so nothing outside this module needs the name and `no-inline-types` keeps its one-home rule. */
interface MemberChatFilter {
  readonly includeArchived?: boolean | undefined;
  readonly characterId?: CharacterId | undefined;
  /** Already trimmed + lowercased by the verb; `undefined` = the unsearched list. */
  readonly search?: string | undefined;
  readonly beforeRecencyAt?: number | undefined;
}

/** The caller's own canon READ FLOOR, in SQL, off the participant row this list already joins — the same
 *  verdict `resolveHistoryFloorSeq` mints in TS (host is never clamped · `full` ⇒ 0 · `from-join` ⇒ joinSeq,
 *  inclusive). It exists so the SEARCH cannot become the one read that reaches beneath D16: without it, a
 *  member floored at their join could search for a phrase and learn it appears in a room's pre-join canon
 *  they may not read. Kept beside {@link resolveHistoryFloorSeq}'s doc deliberately — two spellings of one
 *  rule, and a change to that rule has to land in both. */
function callerHistoryFloorSql(): SQL<number> {
  return sql<number>`case when ${chatParticipants.role} <> 'host' and ${chatParticipants.joinHistoryVisibility} = 'from-join'
    then max(${chatParticipants.joinSeq}, 0) else 0 end`;
}

/** The MEMBER arm of the search's message predicate (§3.6, the D106 member-plane clamp in SQL). A hidden-class
 *  span (`<lie …/>`, `<ofilter …/>`) NEVER reaches a non-host member's payload — `stripHiddenSpans` removes it
 *  from every view and `projectBodyForPreview` from every scent line — so a LIKE over the raw body made the
 *  search the one read that could confirm those bytes: the member types the GM's truth and the room comes back,
 *  which is the whole answer regardless of what the stripped preview then shows (result PRESENCE is the oracle,
 *  and `totalCount` says it again).
 *
 *  So for a NON-HOST caller the body arm is withheld entirely on a tail that carries ANY hidden tag. SQL cannot
 *  strip a span (no regex in SQLite, and the strip is a real tokenizer — `tokenizeForHiddenScan`), so matching
 *  the visible half would mean matching the raw bytes; the honest SQL-expressible verdict is fail-CLOSED. The
 *  cost is FEWER results on exactly the rooms that run the deception grammar, never a leak — and it lands the
 *  member's search back onto exactly "the snippet the row shows" — the snippet
 *  a member is shown is the stripped one.
 *
 *  DERIVED FROM THE REGISTRY, not a hardcoded pair: `HIDDEN_TAGS` is the open hidden-channel registry (graft
 *  #V2 — a third tag is a row there), so a new hidden class joins this guard with no edit here. The `%<tag%`
 *  shape deliberately over-matches (a literal `<lied` in prose suppresses the arm too): over-suppression costs
 *  a search result, under-suppression costs the secret. An empty registry ⇒ `and()` is undefined ⇒ members get
 *  no body arm at all, which is the right way for this to fail. */
function memberHiddenBodyGuard(): SQL | undefined {
  return or(eq(chatParticipants.role, "host"), and(...HIDDEN_TAGS.map((def) => sql`lower(${messageVariants.content}) not like ${`%<${def.tag}%`}`)));
}

/** The library-list SEARCH predicate: matches the chat TITLE, a participant NAME, or the newest message's
 *  body — the snippet the row already shows, not full-transcript search.
 *
 *  TWO DEVIATIONS, both deliberate and both visible to the user as MORE results rather than fewer:
 *  • The message arm matches the newest message's RAW body, while the rendered `lastMessagePreview` is that
 *    body run through `projectBodyForPreview` (hidden-class + structured spans dropped, flattened, capped
 *    at `PREVIEW_MAX_CHARS`). So a hit can land on a room whose visible snippet does not contain the term. HIDDEN-CLASS bytes
 *    are the one exception, and they are gated the other way — see {@link memberHiddenBodyGuard}.
 *  • The name arm matches CHARACTER seats only. Human display names live in the identity publics table, and
 *    THE HEADER LAW OF THIS FILE reserves `users` for the verb layer — resolving a human's name here would
 *    be exactly the roster-name resolution that law keeps out. Character seats are joined the way
 *    `persistence/identity.ts` already joins them (a filter, never a projection). Departed seats count, matching
 *    the character-scoped history projection's own promise. */
function searchPredicate(db: Db, needle: string): SQL | undefined {
  const like = `%${needle}%`;
  return or(
    sql`lower(${chats.title}) like ${like}`,
    exists(
      db
        .select({ named: sql`1` })
        .from(characterSeats)
        .innerJoin(characters, eq(characters.id, characterSeats.characterId))
        .where(and(eq(characterSeats.chatId, chats.id), sql`lower(${characters.name}) like ${like}`)),
    ),
    exists(
      db
        .select({ said: sql`1` })
        .from(messages)
        .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
        .where(
          and(
            eq(messages.chatId, chats.id),
            // The chat's TAIL row. A nested drizzle sub-select (not an alias in a raw template — an alias
            // only exists where drizzle emits its FROM, and a bare one renders as a reference to a table
            // that was never declared: `no such table`).
            sql`${messages.seq} = (${db
              .select({ tail: max(messages.seq) })
              .from(messages)
              .where(eq(messages.chatId, chats.id))})`,
            gte(messages.seq, callerHistoryFloorSql()),
            memberHiddenBodyGuard(),
            sql`lower(${messageVariants.content}) like ${like}`,
          ),
        ),
    ),
  );
}

/** The `listMemberChats`/`countMemberChats` SCOPE — the one place the library list's membership + visibility
 *  + projection predicates are spelled, so the page and its census can never disagree about what they count.
 *
 *  `characterId` is the D18 PROJECTION filter ("her threads"), and it deliberately matches DEPARTED seats
 *  too: a room she has since left is part of her history
 *  (`roster.characterSeatedInAnotherChat` counts past seats the same way).
 *  It is an EXISTS over the junction rather than a second join — a chat with two seats for the same character
 *  would otherwise duplicate the row and silently corrupt both the page and the count. */
function memberChatScope(db: Db, userId: UserId, opts: MemberChatFilter): SQL | undefined {
  const characterId = opts.characterId;
  return and(
    // MEMBERSHIP + THE TEMPORARY/HUSK/ARCHIVED LENSES ARE `@orb/db/kit`'S NOW (#1131) — the character
    // library's row has to count the SAME rooms this list pages, and neither domain may import the other
    // (constitution §2), so those four arms live one layer down and both readers spell them once. What
    // stays here is what is a chat-LIST lens rather than visibility: the recency bound, the per-character
    // projection, and the search.
    memberVisibleChatScope(userId, opts),
    opts.beforeRecencyAt === undefined ? undefined : lt(chatRecencySql(db), opts.beforeRecencyAt),
    characterId === undefined
      ? undefined
      : exists(
          db
            .select({ seated: sql`1` })
            .from(characterSeats)
            .where(and(eq(characterSeats.chatId, chats.id), eq(characterSeats.characterId, characterId))),
        ),
    opts.search === undefined ? undefined : searchPredicate(db, opts.search),
  );
}

/** THE ONE RECENCY CLOCK of the chat library (#150) — `coalesce(max(message.created_at), chats.updated_at)`,
 *  the value every surface DISPLAYS as `lastMessageAt ?? updatedAt`, ordered on so that "the top row is the
 *  most recent conversation" is true BY CONSTRUCTION rather than by a coincidence of write paths (it used to
 *  order on `chats.updated_at`, a row-modification stamp a turn does not write and a metadata touch does).
 *
 *  THE EXPRESSION MOVED TO `@orb/db/kit` WITH THE VISIBILITY SCOPE (#1131) so the character library's
 *  per-character `MAX` reads the same clock; this alias keeps the call sites in this file reading as before.
 *
 *  IT MIRRORS {@link loadChatMessageStats}'S PREDICATE EXACTLY, selected-variant join included: that read is
 *  where `ChatSummary.lastMessageAt` comes from, so any divergence would sort a list by a number no row in it
 *  shows. The verb-level test that pins `items` non-increasing in `lastMessageAt ?? updatedAt` is the
 *  enforcer of that agreement. */
function chatRecencySql(db: Db): SQL<number> {
  return chatRecencyExpr(db);
}

/** The membership-scoped library list — the chats the user is a present member of, newest-CONVERSATION
 *  first, KEYSET-PAGED. Archived excluded unless `includeArchived`; temporary chats are always hidden (they
 *  persist so turns can run, but never surface in the library — `reapTemporaryChats` sweeps them once expired).
 *
 *  The order is `({@link chatRecencySql} DESC, id DESC)` and the cursor rides BOTH — hence the `recencyAt`
 *  each row carries out, which is the cursor's own field: the sort key is an EXPRESSION, so a caller cannot
 *  re-derive it from the row's columns, and the tail is not unique on its own (a bulk import stamps hundreds
 *  of rows identically, and a keyset without a unique tail silently skips or repeats rows at the page seam).
 *  Callers get `limit + 0` rows — the verb decides `nextCursor` from a full page, so this never over-reads. */
export async function listMemberChats(
  db: Db,
  userId: UserId,
  opts: MemberChatFilter & { readonly limit: number; readonly cursor?: ChatListCursor | undefined },
): Promise<(ChatRow & { recencyAt: number })[]> {
  const cursor = opts.cursor;
  const recencyAt = chatRecencySql(db);
  const rows = await db
    .select({ ...chatRowSelection, recencyAt })
    .from(chats)
    .innerJoin(chatParticipants, memberChatScope(db, userId, opts))
    .where(cursor === undefined ? undefined : or(lt(recencyAt, cursor.recencyAt), and(eq(recencyAt, cursor.recencyAt), lt(chats.id, cursor.id))))
    .orderBy(desc(recencyAt), desc(chats.id))
    .limit(opts.limit);
  return rows.map(({ recencyAt: at, ...row }) => ({ ...toChatRow(row), recencyAt: at }));
}

/** The library list's CENSUS — how many chats match the same scope the page above is a window into. A real
 *  `COUNT`, never `items.length`: a paged list's loaded-row count is a number that silently means something
 *  else, and the chats band + the character card's "N chats" both print this to the user. */
export async function countMemberChats(db: Db, userId: UserId, opts: MemberChatFilter): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(chats)
    .innerJoin(chatParticipants, memberChatScope(db, userId, opts));
  return rows.at(0)?.total ?? 0;
}

/** THE SEEDED-EXAMPLE DRESSING READ (the demo-chat pack heal): this user's HOSTED copy of one bundled
 *  example, found by the stable `chats.importHash` the seeder stamps, with the two dressing fields the heal
 *  can fill. `undefined` ⇒ they have no such example (never seeded, or deleted — the heal never re-creates
 *  one; the seeded latch owns deletion-respect).
 *
 *  Scoped through the HOST participant row, which is also where `hasSeatPersona` comes from: the whole point
 *  of the heal is that a seeded room whose host seat carries no persona reads as "Playing as None" and names
 *  its rpg player actor by the bare account handle. */
export async function loadSeededChatDressing(
  db: Db,
  userId: UserId,
  importHash: string,
): Promise<{ chatId: ChatId; hasSeatPersona: boolean; hasBackground: boolean } | undefined> {
  const rows = await db
    .select({ id: chats.id, metadata: chats.metadata, activePersonaId: chatParticipants.activePersonaId })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)),
    )
    .where(eq(chats.importHash, importHash))
    .limit(LIMIT_ONE);
  const row = rows[0];
  if (row === undefined) {
    return;
  }
  const background = parseChatMetadata(row.metadata).background;
  return {
    chatId: row.id,
    hasSeatPersona: row.activePersonaId !== null,
    // A stored `kind:"none"` is "the host cleared it" — a real choice, not a hole (the heal must not undo it).
    hasBackground: background !== undefined,
  };
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
 *  VISIBLE rows only: the `innerJoin` to the SELECTED variant is the visibility predicate (a slot whose
 *  selected variant was deleted has nothing to count or preview) — the same join every canon read does.
 *  D124 retired the second half of this predicate: rpg no longer mints content-less "state anchor" slots, so
 *  there is no non-message canon row left to exclude (a count-inflation class — "7 messages" over 3 real
 *  ones — is unrepresentable now, not filtered). */
export async function loadChatMessageStats(db: Db, chatIds: readonly ChatId[]): Promise<Map<ChatId, { messageCount: number; lastMessageAt: number | null }>> {
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for chat message stats. Ends if it outlives the call.
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
    .where(inArray(messages.chatId, [...chatIds]))
    .groupBy(messages.chatId);
  for (const r of rows) {
    out.set(r.chatId, { messageCount: r.messageCount, lastMessageAt: r.lastMessageAt ?? null });
  }
  return out;
}

/** The NEWEST VISIBLE canon row per chat — its `seq` (the caller's floor verdict is decided on it) + the
 *  selected variant's raw body, for the `ChatSummary.lastMessagePreview` scent line. Batched over a set of
 *  ids in ONE read (a `row_number()` window partitioned by chat, `rn = 1`) — never a per-chat query, so the
 *  library list stays one page = a fixed number of reads. Same VISIBILITY predicate as
 *  {@link loadChatMessageStats} (the selected-variant join), so the row that sets `lastMessageAt`
 *  is the row that supplies the preview. A chat with no visible message is absent from the map. */
export async function loadChatLastMessages(db: Db, chatIds: readonly ChatId[]): Promise<Map<ChatId, { seq: number; content: string }>> {
  // @orb-waive persistence-no-in-memory-state(Map): query-local lookup map for the per-chat last message. Ends if it outlives the call.
  const out = new Map<ChatId, { seq: number; content: string }>();
  if (chatIds.length === 0) {
    return out;
  }
  const ranked = db
    .select({
      chatId: messages.chatId,
      seq: messages.seq,
      content: messageVariants.content,
      rn: sql<number>`row_number() over (partition by ${messages.chatId} order by ${messages.seq} desc)`.as("rn"),
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(inArray(messages.chatId, [...chatIds]))
    .as("ranked");
  const rows = await db.select({ chatId: ranked.chatId, seq: ranked.seq, content: ranked.content }).from(ranked).where(eq(ranked.rn, 1));
  for (const r of rows) {
    out.set(r.chatId, { seq: r.seq, content: r.content });
  }
  return out;
}

/** Walk the fork-lineage chain from `chatId` up to its root — unscoped (membership is gated per-ancestor
 *  by the verb). Returns rows self-first; the `visited` set + `maxDepth` cap defend against a cycle. */
export async function loadAncestorChain(db: Db, chatId: ChatId, maxDepth = 64): Promise<ChatRow[]> {
  const chain: ChatRow[] = [];
  // @orb-waive persistence-no-in-memory-state(Set): query-local visited Set for ancestor chain cycle guard. Ends if it outlives the call.
  const visited = new Set<ChatId>();
  let current: ChatId | undefined = chatId;
  while (current !== undefined && !visited.has(current) && chain.length < maxDepth) {
    visited.add(current);
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

/** THE §6.7 INLINE-REPLY ORIGIN SET — the (slot → asset ids) pairs whose `message_assets` link was stamped
 *  `inline-reply`, i.e. pictures THIS model emitted inside its own turn. It is the ONE input that lets
 *  `substrate/wire-history`'s media predicate relax for an assistant row without opening the row wholesale:
 *  an `/imagine` illustration on the very same kind of row is stamped `illustration` and is absent here, so
 *  it stays display-only (`verbs/post-narrator-message.ts` is that writer).
 *
 *  KEYED ON THE PAIR, never on the asset id alone. A chat-wide id set would let ANY assistant-delivered row
 *  that merely spells `![x](asset:<id>)` ride that asset back — a world-info entry, an author's note, a card
 *  greeting, a spliced injection — because those bodies are authored text and the id is guessable from the
 *  transcript the author can already read. The link row is per (message, asset), so the predicate asks the
 *  question the origin column actually answers: did THIS slot's own generation produce this picture?
 *
 *  Chat-scoped through the `messages` join (the tenancy belt: `message_assets` has no chat column of its
 *  own), so an id from another room can never enter the map. */
export async function loadInlineReplyAssetIds(db: Db, chatId: ChatId): Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>> {
  const rows = await db
    .select({ messageId: messageAssets.messageId, assetId: messageAssets.assetId })
    .from(messageAssets)
    .innerJoin(messages, eq(messages.id, messageAssets.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageAssets.origin, INLINE_REPLY_ORIGIN)));
  // @orb-waive persistence-no-in-memory-state(Map): query-local regrouping of the link rows this query just returned. Ends if it outlives the call.
  const out = new Map<MessageId, Set<AssetId>>();
  for (const row of rows) {
    const existing = out.get(row.messageId);
    if (existing === undefined) {
      // @orb-waive persistence-no-in-memory-state(Set): the per-slot asset bucket of that same query-local regrouping. Ends if it outlives the call.
      out.set(row.messageId, new Set([row.assetId]));
    } else {
      existing.add(row.assetId);
    }
  }
  return out;
}

/** THE §8.8 `conversation` CARRY SOURCE: every canon slot's persisted replayable thinking, keyed by slot id.
 *  Rows with a NULL/empty/malformed blob are simply absent from the map — a caller asks "does this row have
 *  thinking to replay" and gets one answer.
 *
 *  A SEPARATE READ, not a column on `messageViewSelection`, on purpose. `MessageView` crosses the tRPC
 *  boundary to the browser, and a thinking signature / an OpenAI encrypted-reasoning blob is host-side replay
 *  material with no render surface — putting it on the view would ship KBs of provider-opaque bytes to every
 *  client on every history read and would need its own member-visibility strip to stay out of a deception
 *  game's non-host viewer. The engine calls this ONLY on the `conversation` rung, so every other turn pays
 *  nothing. The blob is PARSED (`chatReasoningPartSchema`), never the drizzle `$type` cast. */
export async function loadCanonReasoningParts(db: Db, chatId: ChatId): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> {
  const rows = await db
    .select({ messageId: messages.id, reasoningParts: messageVariants.reasoningParts })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.chatId, chatId));
  // @orb-waive persistence-no-in-memory-state(Map): query-local regrouping of the variant rows this query just returned. Ends if it outlives the call.
  const out = new Map<MessageId, readonly ChatReasoningPart[]>();
  for (const row of rows) {
    const parsed = reasoningPartsSchema.safeParse(row.reasoningParts);
    if (parsed.success && parsed.data.length > 0) {
      out.set(row.messageId, parsed.data);
    }
  }
  return out;
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
  tokenProvenance: import("@orb/contracts/chat").TokenProvenance;
  costUsd: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  contextWindow: number | null;
  genStartedAt: number | null;
  genFinishedAt: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  /** The variant's sidecar, PARSED at this seam (never the drizzle `$type` cast). An absent/corrupt blob
   *  degrades to `{}` — a stats delta must not fail on one unmodelled row (§5.3c class 3). */
  metadata: VariantMetadata;
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
  tokenProvenance: import("@orb/contracts/chat").TokenProvenance;
  genStartedAt: number | null;
  genFinishedAt: number | null;
  model: string | null;
  provider: string | null;
  reasoning: string | null;
  /** The variant's sidecar, PARSED at this seam — the {@link CanonStatRow.metadata} twin. */
  metadata: VariantMetadata;
}

const canonStatSelection = {
  messageId: messages.id,
  characterId: messages.characterId,
  role: messages.role,
  createdAt: messages.createdAt,
  content: messageVariants.content,
  tokensIn: messageVariants.tokensIn,
  tokensOut: messageVariants.tokensOut,
  tokenProvenance: messageVariants.tokenProvenance,
  costUsd: messageVariants.costUsd,
  cacheReadTokens: messageVariants.cacheReadTokens,
  cacheWriteTokens: messageVariants.cacheWriteTokens,
  contextWindow: messageVariants.contextWindow,
  genStartedAt: messageVariants.genStartedAt,
  genFinishedAt: messageVariants.genFinishedAt,
  model: messageVariants.model,
  provider: messageVariants.provider,
  reasoning: messageVariants.reasoning,
  // Raw JSON blob — parsed by `loadCanonStatRows` with `parseVariantMetadata` (never the `$type` cast).
  metadata: messageVariants.metadata,
  selectedIdx: messageVariants.idx,
  variantCount: sql<number>`(select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${messages.id})`,
} as const;

/** The stats-contribution rows (slot ⋈ selected variant) for a set of slots in one chat — the
 *  delete-messages delta input. Chat-scoped: a foreign id from another chat matches nothing. */
export async function loadCanonStatRows(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): Promise<CanonStatRow[]> {
  const rows = await db
    .select(canonStatSelection)
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), inArray(messages.id, [...messageIds])));
  return rows.map((r) => ({ ...r, metadata: parseVariantMetadata(r.metadata) }));
}

/** The non-selected variants (swipes) of a slot set, joined to the slot's attribution — the
 *  delete-messages swipe-delta input.
 *
 *  `selectedVariantId` is NULLABLE (D26 — SET NULL when the pointed-at variant is deleted), and SQL is
 *  three-valued: a bare `ne(variant.id, messages.selectedVariantId)` evaluates to NULL for a slot with no
 *  pointer, silently dropping ALL of that slot's variants from the delta. `or(isNull(…), ne(…))` is the
 *  total reading of "not the selected one": when nothing is selected, every variant is a swipe. */
export async function loadSwipeStatRows(db: Db, chatId: ChatId, messageIds: readonly MessageId[]): Promise<SwipeStatRow[]> {
  const rows = await db
    .select({
      messageId: messageVariants.messageId,
      characterId: messages.characterId,
      msgCreatedAt: messages.createdAt,
      content: messageVariants.content,
      tokensIn: messageVariants.tokensIn,
      tokensOut: messageVariants.tokensOut,
      tokenProvenance: messageVariants.tokenProvenance,
      genStartedAt: messageVariants.genStartedAt,
      genFinishedAt: messageVariants.genFinishedAt,
      model: messageVariants.model,
      provider: messageVariants.provider,
      reasoning: messageVariants.reasoning,
      // Raw JSON blob — parsed below with `parseVariantMetadata` (never the drizzle `$type` cast).
      metadata: messageVariants.metadata,
    })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(
      and(
        eq(messages.chatId, chatId),
        inArray(messageVariants.messageId, [...messageIds]),
        or(isNull(messages.selectedVariantId), ne(messageVariants.id, messages.selectedVariantId)),
      ),
    );
  return rows.map((r) => ({ ...r, metadata: parseVariantMetadata(r.metadata) }));
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
    generationId: chatStreamEvents.generationId,
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

/** The durable log row minted under ONE event id — its cursor plus the payload AS STORED, or undefined when
 *  no row carries that id. The GROUND-TRUTH read behind the bus's terminal-drop classification (#1544): after
 *  a same-id retry fails, only the stored payload can say whether OUR append is the one that committed (id
 *  existence alone cannot — the row under that id may belong to a different event). */
export async function loadChatEventById(db: Db, id: ChatEventId): Promise<ChatEventLogRow | undefined> {
  const rows = await db.select({ seq: chatEvents.seq, payload: chatEvents.payload }).from(chatEvents).where(eq(chatEvents.id, id));
  return rows.at(0);
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
 *  to its variant id. TWO belts, both in the WHERE so the next caller cannot forget either (#1399):
 *  chat-scoped via the `messages` join (a foreign-chat `messageId` matches nothing), and floored at the
 *  CALLER's D16 `floorSeq` (`substrate/auth::resolveHistoryFloorSeq`, stamped by `guard::requireParticipant`)
 *  — a variant id set IS an identifier oracle over canon the floored `listMessages` withholds, and "how many
 *  swipes does that pre-join slot have" is not a question a clamped member may ask. Both misses come back as
 *  the SAME empty result, which the verb collapses to one leak-free NOT_FOUND. */
export async function loadMessageVariantSummaries(
  db: Db,
  chatId: ChatId,
  messageId: MessageId,
  floorSeq: number,
): Promise<{ variantId: MessageVariantId; idx: number }[]> {
  return await db
    .select({ variantId: messageVariants.id, idx: messageVariants.idx })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageVariants.messageId, messageId), gte(messages.seq, floorSeq)))
    .orderBy(asc(messageVariants.idx));
}

/** ONE variant's persisted WIRE RECORD — the prompt the generation actually sent plus the knobs/draws it ran
 *  under (`getVariantWire`, the host inspector). CHAT-SCOPED through the `messages` join, which is the whole
 *  cross-tenant belt: a variant of a foreign chat matches nothing even when the caller passes a chatId they
 *  legitimately host, so the verb collapses it to the SAME leak-free NOT_FOUND an unknown id gives. Each JSON
 *  blob is parsed at this read seam (never surfaced raw / cast): a malformed blob degrades to `null` — the
 *  inspector then honestly reports "nothing captured" instead of throwing (the `variableDelta` degrade
 *  precedent). `undefined` ⇒ no such variant in this chat. */
export async function loadVariantWire(db: Db, chatId: ChatId, variantId: MessageVariantId): Promise<VariantWireView | undefined> {
  const rows = await db
    .select({
      variantId: messageVariants.id,
      promptSnapshot: messageVariants.promptSnapshot,
      params: messageVariants.params,
      macroDraws: messageVariants.macroDraws,
      rawContent: messageVariants.rawContent,
      macroFreezes: messageVariants.macroFreezes,
    })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messages.chatId, chatId), eq(messageVariants.id, variantId)))
    .limit(LIMIT_ONE);
  const row = rows.at(0);
  if (row === undefined) {
    return;
  }
  const draws = userMacroDrawsSchema.safeParse(row.macroDraws);
  // D129-F: the freeze provenance rides THIS host-gated view and no other. `rawContent` is a plain column (no
  // parse seam to degrade); the record parses like every other JSON blob here — malformed ⇒ null, so the
  // inspector honestly reports "nothing captured" rather than throwing.
  const freezes = macroFreezeRecordSchema.safeParse(row.macroFreezes);
  return {
    variantId: row.variantId,
    prompt: sentPromptSchema.safeParse(row.promptSnapshot).data ?? null,
    params: userIntentSchema.safeParse(row.params).data ?? null,
    macroDraws: draws.success ? draws.data : null,
    rawContent: row.rawContent,
    macroFreezes: freezes.success ? freezes.data : null,
  };
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

/** Every USER slot in a chat authored by `authorUserId`, ascending — the `reattributePersona` `mine` scope's
 *  row resolver (the server arm that replaced the client's 100-message window). The predicate IS the verb's
 *  belt set for this arm: chat-scoped (no foreign row can enter), `role='user'` (an assistant/system row has
 *  no authoring persona), and author-pinned (a caller can only ever resolve their OWN rows — reach widens,
 *  authority does not). `fromSeq` (inclusive) is the advanced "only the wrong-persona stretch" floor. */
export async function loadAuthoredUserMessageIds(db: Db, chatId: ChatId, authorUserId: UserId, fromSeq: number | undefined): Promise<MessageId[]> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.role, "user"),
        eq(messages.authorUserId, authorUserId),
        ...(fromSeq === undefined ? [] : [gte(messages.seq, fromSeq)]),
      ),
    )
    .orderBy(asc(messages.seq));
  return rows.map((r) => r.id);
}

/** Does this chat have ANY user-role canon row? THE greeting-malleability predicate: the first user turn is
 *  where `freezeGreetingVolatiles` (verbs/turn.ts) bakes every prior greeting's volatile macros, so a room
 *  with no user row is still in the window where a greeting may be stepped among its card's alternates.
 *  `limit(1)` — this is an EXISTENCE question, never a count. */
export async function loadHasUserMessage(db: Db, chatId: ChatId): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.role, "user")))
    .limit(1);
  return rows.length > 0;
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
 *  so the fold mutators' by-`messageId` override/filter/remap pass it through untouched. */
interface VariableDeltaRow {
  readonly seq: number;
  readonly messageId: MessageId | null;
  readonly delta: readonly VarOp[];
}

/**
 * THE ONE PHYSICAL READ of `chats.standalone_variable_deltas` — the parsed batches AND the exact stored bytes
 * they were parsed from, projected out of the SAME row in the SAME statement.
 *
 * Both projections come from one read because the standalone write is a compare-and-set and its two halves
 * must describe one snapshot: the predicate compares the stored BYTES, the rebuilt array is derived from the
 * PARSED value, and two separate reads of this column let a sibling commit BETWEEN them — the guard would
 * then pass against the sibling's bytes while the array was rebuilt from the pre-sibling chain, reproducing
 * the very lost update the CAS exists to stop (#1634 item 1). One statement makes that divergence
 * unrepresentable rather than merely unlikely.
 *
 * The RAW half is deliberately not a re-serialization of the parsed half: a parse→stringify round trip
 * normalizes key order and drops unknown fields, and a predicate built from it would compare bytes the column
 * may not hold. Parsing degrades to `[]` on a malformed blob, never throws (the read-seam contract).
 * `undefined` ⇒ no such chat row (a write is a no-op, not a race); `raw: null` ⇒ the row was never written.
 */
export async function loadStandaloneVariableDeltasWithRaw(
  db: Db,
  chatId: ChatId,
): Promise<{ readonly raw: string | null; readonly deltas: StandaloneVariableDelta[] } | undefined> {
  const rows = await db
    .select({ raw: sql<string | null>`${chats.standaloneVariableDeltas}`, parsed: chats.standaloneVariableDeltas })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(LIMIT_ONE);
  const row = rows.at(0);
  if (row === undefined) {
    return;
  }
  const parsed = standaloneVariableDeltasSchema.safeParse(row.parsed);
  return { raw: row.raw, deltas: parsed.success ? parsed.data : [] };
}

/** The chat's standalone (out-of-turn) runtime-variable delta batches, seq-ordered as stored — the parsed
 *  half of the one read above (never a second statement against the same column). */
async function loadStandaloneVariableDeltas(db: Db, chatId: ChatId): Promise<StandaloneVariableDelta[]> {
  return (await loadStandaloneVariableDeltasWithRaw(db, chatId))?.deltas ?? [];
}

/** The MESSAGE half of the fold source: each slot's `seq` + its SELECTED variant's `variable_delta`, in seq
 *  order. Split out from {@link loadVariableDeltas} so the standalone write can take this half ALONE and
 *  resolve the standalone half from its CAS read — one read per column on that path. */
export async function loadMessageVariableDeltas(db: Db, chatId: ChatId): Promise<VariableDeltaRow[]> {
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

/** The runtime-cache fold SOURCE, seq-ordered: the per-variant message deltas along the selected-variant
 *  chain UNIONED with the chat's standalone (out-of-turn) delta batches. Each blob is parsed at the
 *  read seam; a malformed blob degrades to `[]`, never throws. `foldChain` re-sorts by `seq`, so the two
 *  sources interleave in real-apply order (a standalone stamped at maxSeq folds after that message, before
 *  the next turn's). */
export async function loadVariableDeltas(db: Db, chatId: ChatId): Promise<VariableDeltaRow[]> {
  const [messageEntries, standalone] = await Promise.all([loadMessageVariableDeltas(db, chatId), loadStandaloneVariableDeltas(db, chatId)]);
  return [...messageEntries, ...standalone.map(toStandaloneFoldRow)];
}

/** A standalone batch as a fold-source row — `messageId: null` is what marks it standalone to the mutators'
 *  by-`messageId` override/filter/remap. One home, so the composed read and the standalone write's own
 *  derivation cannot spell the mapping differently. */
export function toStandaloneFoldRow(batch: StandaloneVariableDelta): VariableDeltaRow {
  return { seq: batch.seq, messageId: null, delta: batch.delta };
}

/** The turn origin stamped on a reply SLOT — the `getTurnOrigin` read backing the automation cascade
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

/** The chat's CURRENT runtime variables — the materialized delta-fold cache (`chats.runtimeVariables`, the
 *  same column the CEL env and the plugin membrane's `getVariables` read). `{}` = no variable ever set. */
export async function loadRuntimeVariables(db: Db, chatId: ChatId): Promise<Record<string, string>> {
  const rows = await db.select({ runtimeVariables: chats.runtimeVariables }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  return rows.at(0)?.runtimeVariables ?? {};
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
