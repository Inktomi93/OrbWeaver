// schema/chat — the chat cluster (producer: domain/chat; the biggest, most intricate slice). Ten tables:
// chats · messages · message_variants · chat_participants · chat_invites · pending_turns · chat_events ·
// chat_stream_events · chat_injections · chat_locks. Built WHOLE (no feature-phasing — ledger D16); the
// authoritative spec is `core/Tier-1-DB.md`.
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D18 — chats are MEMBERSHIP-scoped: there is NO `chats.ownerId`. Authority is the host participant
//     (`chat_participants.role='host'`); "list my chats" is pure membership. A user hard-delete cascades
//     `chat_participants` (the membership), never an owner-FK restrict on the chat.
//   • D25 — DROP `chats.sessionId`/`sessionDirty` (agent-sdk cache state → `sdk-session.ts`); KEEP the
//     portable compaction checkpoint `compactSummary` + `compactedAtSeq` (chat canon, the stateless
//     OpenRouter runner uses it too).
//   • D26 — `messages` is a PURE SLOT (identity + attribution + selection only); ALL content/economics
//     live on `message_variants`. `selectedVariantId` is the pointer a swipe flips (zero content copy).
//     Attribution (`authorUserId`/`characterId`/`personaId`) is SLOT-level — a swipe never re-voices.
//   • D27 — a fork is a deep COPY + the `chats.parentChatId` self-FK (SET NULL so a fork outlives its
//     parent as a root); there is NO `messages.parentId` (the message-level branch axis is gone).
//   • D28 — no character version table: `chat_participants.characterId` / `messages.characterId` key on
//     `characters.id` (live identity). No `chats.characterVersionId`.
//
// Enum columns DERIVE their one canonical tuple (never re-spelled): `messages.role` /
// `chat_injections.role` ← `MESSAGE_ROLES` (@orb/kit/message-role, D32); `chat_participants.kind` ←
// `PARTICIPANT_KINDS` (the 4-member tuple, D60: human/character/agent each have a kind-shape arm; `observer`
// stays RESERVED + un-seatable), `.role` ← `PARTICIPANT_ROLES`, `joinHistoryVisibility` ←
// `JOIN_HISTORY_VISIBILITIES`; `chat_invites.status` ← `INVITE_STATUSES` (all @orb/contracts/chat).
// `chat_events.type` derives the `ChatBusEvent` discriminant set (`CHAT_BUS_EVENT_TYPES` keys); the
// `chat_injections.position` + `chat_stream_events.kind` tuples are tied to the contract wire types
// (`satisfies`) — compile-time validity + a test-mirror over each column's `.enumValues`. Every CHECK is
// built from the SAME tuple as a static raw fragment (a CHECK is DDL — no bound parameters).
//
// Timestamps are plain `integer("x_at")` epoch-MS NUMBERS (contracts view timestamps as `number`), born at
// insert via `(unixepoch() * 1000)`; caller-set timestamps are required `integer` numbers. JSON columns
// are `$type<T>()` + read at the `@orb/db/kit` parse-seam (`chats.metadata` lazy/fault-isolated sub-blobs;
// `message_variants.params`/`promptSnapshot`/`rawRequest`/`rawResponse`/`metadata`).

import type {
  AssembledPrompt,
  ChatBusEvent,
  ChatDeltaEvent,
  ChatInjection as ChatInjectionWire,
  ChatMetadata,
  StandaloneVariableDelta,
  ToolCallRecord,
} from "@orb/contracts/chat";
import { CHAT_BUS_EVENT_TYPES, INVITE_STATUSES, JOIN_HISTORY_VISIBILITIES, PARTICIPANT_KINDS, TURN_INITIATORS } from "@orb/contracts/chat";
// PARTICIPANT_ROLES is one-homed in @orb/contracts/identity (the can() resource-role axis; PD-59).
import { PARTICIPANT_ROLES } from "@orb/contracts/identity";
import type { UserIntent } from "@orb/contracts/preset";
import type {
  AssetId,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  MessageAssetId,
  MessageId,
  MessageVariantId,
  PendingTurnId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { characters } from "./character";
import { personas } from "./persona";
import { users } from "./users";

// A CHECK list is a static DDL fragment derived from the canonical tuple (NOT re-spelled): e.g.
// `role in ('system', 'user', 'assistant')`. A CHECK cannot carry bound parameters (users.ts pattern).
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chats — the membership-scoped room (D18: NO ownerId). The host participant is the authority. Carries the
// stable `{{user}}` anchor, the fork lineage pointer, the portable compaction checkpoint (D25), the pending
// host-handoff nominee (Part III §2), and the lazy-parsed room-behavior `metadata` blob.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The chat-room behavior blob (`ChatMetadata`) is one-homed in `@orb/contracts/chat` — the `$type` below
// and the domain's `parseChatMetadata` (the runtime fault-isolating parser) share that ONE shape.

// Natural-arbitration sampling weight (0–1); the born default for a new participant.
const DEFAULT_TALKATIVENESS = 0.5;

// The standalone (out-of-turn) runtime-variable delta batch shape (`StandaloneVariableDelta`,
// automation-design/03 §1.1) is one-homed in `@orb/contracts/chat` — the `$type` below imports it; typed
// JSON, parsed at the `@orb/db/kit` read seam (`standaloneVariableDeltaSchema`), never cast.

export const chats = sqliteTable(
  "chats",
  {
    // TypeID PK (`chat_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<ChatId>().primaryKey(),
    title: text("title"),
    // D18: NO `ownerId`. Membership (`chat_participants`) is the scope; the host is the authority.
    star: integer("star", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    // ST "Temporary Chat" (PD-65): an ephemeral room — persisted so turns can run, but HIDDEN from the
    // recent list (`listMemberChats` excludes it) and swept by `reapTemporaryChats` once expired. Set only
    // at `startChat` (a fork is born non-temporary). Expiry is a domain TTL over `createdAt`, not a column.
    temporary: integer("temporary", { mode: "boolean" }).notNull().default(false),
    // Two-party host handoff (Part III §2): the PENDING nominee, carried between `nominateHostHandoff` (the
    // host sets it) and `acceptHostHandoff` (the nominee — and ONLY the nominee — clears it on the atomic
    // role swap). One pending nomination per chat (a re-nominate overwrites). Null = no pending handoff.
    // SET NULL on user delete: a deleted nominee just clears the nomination, never deletes the chat (D18).
    pendingHostUserId: text("pending_host_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The stable `{{user}}` POV for card-authored sections (renamed from `pinnedPersonaId`). A persona
    // delete nulls the anchor (SET NULL) — it must NOT delete the chat.
    anchorPersonaId: text("anchor_persona_id")
      .$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    // Fork lineage (D27): a fork is a deep COPY; this self-FK is the only link. SET NULL so a fork
    // outlives its parent as a root. `forkedAt` is the copy timestamp (null for a non-fork root chat).
    parentChatId: text("parent_chat_id")
      .$type<ChatId>()
      .references((): AnySQLiteColumn => chats.id, { onDelete: "set null" }),
    forkedAt: integer("forked_at"),
    // Portable compaction checkpoint (D25 — STAYS): the summary text + the seq it covers through.
    compactSummary: text("compact_summary"),
    compactedAtSeq: integer("compacted_at_seq"),
    // The room-behavior blob (GroupConfig/RoomOverrides/OpeningPolicy) — typed JSON, lazy-parsed at the
    // `@orb/db/kit` read seam; never trusted raw. Seeded from `userSettings.groupDefaults` (domain).
    metadata: text("metadata", { mode: "json" }).$type<ChatMetadata>(),
    // PERSISTED CANON: the per-chat ChoiceBlock variable flush — `setVariables` writes it,
    // `getStoredVariables` reads it. A `{{var}}`→value map; typed JSON, parsed at the `@orb/db/kit` read
    // seam. Nullable (no variables flushed yet).
    variableValues: text("variable_values", { mode: "json" }).$type<Record<string, string>>(),
    // DERIVED RUNTIME CACHE (D46 runtime plane): the O(1) materialization of `foldVarOps` over the selected-
    // variant chain's `message_variants.variable_delta`. Recomputed on every mutating event (turn commit / swipe
    // select / delete / fork); NOT authored directly. Distinct from `variableValues` (the config-plane store) —
    // the assembly env seed overlays THIS over the resolved config picks. Typed JSON; nullable (nothing folded yet).
    runtimeVariables: text("runtime_variables", { mode: "json" }).$type<Record<string, string>>(),
    // The standalone (out-of-turn) runtime-variable delta log (automation-design/03 §1.1) — an
    // `applyVariableOps` call with no turn in flight appends a seq-stamped batch here; every runtime-cache
    // fold reads it alongside the per-variant message deltas. Nullable JSON (no standalone delta yet).
    standaloneVariableDeltas: text("standalone_variable_deltas", { mode: "json" }).$type<readonly StandaloneVariableDelta[]>(),
    // Import provenance: the source `.jsonl` filename a chat was imported from (null for a born-here chat).
    importedFrom: text("imported_from"),
    // SHA-256 of the import bytes — the idempotent re-import key (a re-import of identical bytes is a
    // no-op). Mirrors `characters.importHash`. Nullable (null for a born-here chat).
    importHash: text("import_hash"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The lineage walk (membership-gated per ancestor — D18); also speeds the fork-children listing.
    index("chats_parent_idx").on(t.parentChatId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// messages — the PURE SLOT (D26). Identity + attribution + selection ONLY; NO content, NO economics. A
// swipe APPENDs a `message_variants` row and `selectVariant` flips `selectedVariantId` (pointer move, never
// a copy). Attribution is slot-level. NO `parentId` (D27). `characterId` keys on `characters.id` (D28).
//
// THE ATTRIBUTION INVARIANT (owner-ordered schema-hardening, 2026-07-17; D82 delete/recreate sanction).
// Derived exhaustively from EVERY `messages` writer — the engine persist (engine.ts `buildCommitPlan`), the
// user-send (turn.ts `persistUserMessage`), impersonate (turn.ts `persist.role='user'`), the greeting seed
// (start-chat.ts), the image message (generate-image.ts `role='user'`), the fork deep-copy (fork.ts, a
// verbatim `...slot` copy), the edit-dup (edit.ts, a verbatim attribution copy), and the ST bulk-import
// (import-write.ts). The born per-role shape:
//   • role='user'      — authorUserId SET (the sender/importer), characterId NULL, personaId OPTIONAL.
//   • role='assistant' — characterId SET (character voice) XOR authorUserId SET (agent voice — an agent is
//                        a userId-backed principal, D60; round.ts stamps `persist.authorUserId`), never both;
//                        personaId NULL. A character round leaves `characterId` = the speaker; an agent round
//                        leaves `characterId` NULL + `authorUserId` = the agent's user id.
//   • role='system'    — NO current writer mints a system SLOT (the narrator/`postNarratorMessage` op is
//                        unbuilt; `role='system'` today lives only in prompt-assembly injections, never a
//                        canon row). Attribution therefore unconstrained-by-writer here.
// STRUCTURAL arms of this shape are BORN-WHOLE as `messages_attribution_shape` (the `chat_participants`
// kind-shape CHECK is the idiom precedent): characterId ⇒ assistant · personaId ⇒ user · never
// characterId AND authorUserId together. These hold across every writer AND survive the SET-NULL
// degradation below (all-NULL is always legal).
// DELIBERATELY NOT CHECK-ENFORCED — the "attribution NOT NULL keyed to role" arm (user ⇒ authorUserId NOT
// NULL; assistant ⇒ exactly one of characterId/authorUserId). REASON: all three attribution FKs are
// `onDelete: 'set null'` — an identity hard-delete DEGRADES a born-whole row's attribution to NULL to
// preserve the authored line for other members (D18/D26/D28). SQLite evaluates CHECKs during an FK
// SET-NULL cascade, so a NOT-NULL-by-role CHECK would ABORT a legitimate user/character/persona delete;
// fork.ts also copies an already-degraded row forward verbatim. The born (pre-degradation) NOT-NULL shape
// is a test-tier belt over the writers, NOT a DB CHECK. (This is the stickler's flagged looseness, now
// figured out: not "import degradation" — import maps every human to the importer's own id — but the
// SET-NULL history-preservation cascade.)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").$type<MessageId>().primaryKey(),
    // Chat children CASCADE on chat delete.
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // Monotonic per-chat ordering; also the membership join/leave horizon (Part III §1). UNIQUE per chat.
    seq: integer("seq").notNull(),
    // The role axis — derives MESSAGE_ROLES (@orb/kit/message-role, D32). The `enum` option is type-only;
    // the CHECK below is the SQL-level guard.
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    // ── Attribution (SLOT-level — a swipe never re-voices). All nullable per role. ──
    // The human who SENT a user message (server-stamped). Plain `UserId` brand (users.id is a plain
    // nanoid, not a TypeID). SET NULL on user hard-delete — the authored line survives for other members.
    authorUserId: text("author_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The AI identity that VOICED an assistant message (keyed on `characters.id` — live identity, D28).
    // SET NULL on character delete preserves history (the row, minus attribution).
    characterId: text("character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }),
    // Which persona authored a user message. SET NULL on persona delete.
    personaId: text("persona_id")
      .$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    // D26: the pointer to the displayed generation. NULLABLE at the DB layer SOLELY to break the
    // message↔variant circular FK at insert time (insert slot → insert variant → set pointer); the
    // contract `MessageSlot` treats it as non-null post-commit. SET NULL (never CASCADE — that would
    // delete the slot) so deleting the pointed-at variant can't dangle.
    selectedVariantId: text("selected_variant_id")
      .$type<MessageVariantId>()
      .references((): AnySQLiteColumn => messageVariants.id, { onDelete: "set null" }),
    // When true, the slot is held out of the assembled prompt (a hidden message).
    excludedFromPrompt: integer("excluded_from_prompt", { mode: "boolean" }).notNull().default(false),
    // ── Turn origin (automation-design/03 §4) — the automation cascade guard's depth source. TURN-PATH state
    // stamped on the reply SLOT the turn produced, NEVER a bus-event field (the D19/D50 allowlist forbids
    // attribution on the frozen public bus). A human turn is born `'human'`/0 (these defaults — every existing
    // writer: user-send, engine assistant commit, impersonate, greeting seed, fork/edit copy, ST import); an
    // automation `trigger_turn` stamps `'automation'` + parentDepth+1 (hard cap 3). `getTurnOrigin` reads it
    // back when a `messageCommitted`/`turnCompleted` fact resolves depth. Slot-level (D26 — a swipe re-voices
    // nothing, so origin is the slot's, not the variant's). `initiator` derives TURN_INITIATORS (no re-spell).
    initiator: text("initiator", { enum: TURN_INITIATORS }).notNull().default("human"),
    automationDepth: integer("automation_depth").notNull().default(0),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    editedAt: integer("edited_at"),
  },
  (t) => [
    // The canon order + the lifecycle-horizon lookup; seq is unique within a chat.
    uniqueIndex("messages_chat_seq_unique").on(t.chatId, t.seq),
    check("messages_role_check", sql.raw(`role in (${checkList(MESSAGE_ROLES)})`)),
    check("messages_initiator_check", sql.raw(`initiator in (${checkList(TURN_INITIATORS)})`)),
    // The STRUCTURAL attribution shape (see the table header) — born-whole, the `chat_participants`
    // kind-shape CHECK idiom. characterId only voices an assistant; personaId only authors a user line; a
    // slot is never both a character voice AND an agent-user voice. All-NULL is always legal (the SET-NULL
    // identity-delete degradation), so this never aborts an FK cascade — the NOT-NULL-by-role arm is a
    // test belt, not a CHECK (header). Static raw fragment (a CHECK carries no bound parameters).
    check(
      "messages_attribution_shape",
      sql.raw("(character_id IS NULL OR role = 'assistant') AND (persona_id IS NULL OR role = 'user') AND (character_id IS NULL OR author_user_id IS NULL)"),
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// message_variants — the GENERATION record (D26). Holds ALL content + economics + the per-swipe
// `promptSnapshot` + the continue-undo state. NO `characterId`/`authorUserId` — attribution is the SLOT's.
// Every message has ≥1 variant (user/system = exactly 1). `messageId` CASCADE on slot delete.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const messageVariants = sqliteTable(
  "message_variants",
  {
    id: text("id").$type<MessageVariantId>().primaryKey(),
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // 0-based position among this slot's variants (swipes). UNIQUE per message.
    idx: integer("idx").notNull(),
    // The generation text (notNull; a streaming-in-progress variant starts as "").
    content: text("content").notNull(),
    reasoning: text("reasoning"),
    model: text("model"),
    provider: text("provider"),
    reasoningEffort: text("reasoning_effort"),
    // ── Economics (all nullable — populated when the generation finishes). ──
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    costUsd: real("cost_usd"),
    contextWindow: integer("context_window"),
    // The §8 history-budget fit-pass boundary: the earliest message actually included in the assembled
    // history for this generation (null = nothing was dropped / the fit-pass never ran). Powers a client
    // "last-in-context" divider. SET NULL (never CASCADE) — deleting the boundary message should not
    // delete this variant, it should just drop the marker (mirrors `messages.selectedVariantId`).
    contextBoundaryMessageId: text("context_boundary_message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "set null" }),
    maxOutputTokens: integer("max_output_tokens"),
    ttftMs: integer("ttft_ms"),
    finishReason: text("finish_reason"),
    stopReason: text("stop_reason"),
    terminalReason: text("terminal_reason"),
    // The HTTP status of a FAILED generation (diagnostics + the retry-survivor signal alongside
    // terminalReason). Nullable — null on a clean generation.
    apiErrorStatus: integer("api_error_status"),
    // D48 tool-call records — the model-emitted tool exchanges for this variant (tool-use-design/03 §3).
    // FLAG[PD-54]: this DTO retype is the schema-leaf slice of T1 — born-compliant typing while the baseline
    // window is open; the wire seams + the domain-owned recurse loop that WRITE it remain (registry: PD-54
    // ready). Nullable JSON, parsed at the read seam with `toolCallRecordSchema` (never cast).
    toolCalls: text("tool_calls", { mode: "json" }).$type<readonly ToolCallRecord[]>(),
    // D46 runtime plane — the ordered variable ops THIS variant applied (`{{setvar}}`/`{{incvar}}`/…). The chat
    // domain folds these along the selected-variant chain (`foldVarOps`) into `chats.runtime_variables`, so a
    // swipe/fork rewinds by re-folding (derive-don't-stamp — avoids the ST swipe-clobber issue #3263). Nullable JSON,
    // parsed at the read seam with `variableDeltaSchema` (never cast); absent/null ⇒ this variant mutated no vars.
    variableDelta: text("variable_delta", { mode: "json" }).$type<readonly VarOp[]>(),
    // The recorded generation params (D26 `params (UserIntent)`) — typed JSON, parsed at the read seam.
    params: text("params", { mode: "json" }).$type<UserIntent>(),
    // The per-variant assembled-prompt snapshot (D26 — now works per swipe).
    promptSnapshot: text("prompt_snapshot", { mode: "json" }).$type<AssembledPrompt>(),
    genStartedAt: integer("gen_started_at"),
    genFinishedAt: integer("gen_finished_at"),
    // The upstream OpenRouter generation handle (`gen-…`) this variant was billed under — the key
    // `connection.orGenerationCost` settles the per-message cost with (PD-137). Null on a non-OR turn
    // (agent-sdk / responses api / user-authored row). NOT an orbweaver-branded id (an upstream handle).
    generationId: text("generation_id"),
    // Raw provider envelopes (debug/replay) — open JSON, parsed at the read seam.
    rawRequest: text("raw_request", { mode: "json" }).$type<Record<string, unknown>>(),
    rawResponse: text("raw_response", { mode: "json" }).$type<Record<string, unknown>>(),
    // ── Continue-undo state (preContinue* + lastContinuation* + reasoning twins — Tier-1-DB.md §chat). ──
    preContinueContent: text("pre_continue_content"),
    preContinueReasoning: text("pre_continue_reasoning"),
    lastContinuationContent: text("last_continuation_content"),
    lastContinuationReasoning: text("last_continuation_reasoning"),
    // Generation sidecar metadata — open JSON, parsed at the read seam.
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The swipe set + its position; idx is unique within a message.
    uniqueIndex("message_variants_message_idx_unique").on(t.messageId, t.idx),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// message_assets — #67 the STRUCTURAL chat-message ↔ asset link (producer: chat — the send verb writes it,
// like message_variants). A message body stores its inline images as `asset:<id>` TEXT refs (D51 — content
// is a STRING, blocks parsed at render); that text is invisible to the asset-reference REGISTRY
// (`domain/assets/persistence/asset-refs`), which only sees FK-to-`assets.id` COLUMNS. THIS is the FK the
// registry CAN see: one row per (message, attached asset), so a user-uploaded inline chat image is a
// RETAINING reference and GC never reaps a blob still shown in a live chat. Keys on the message SLOT (D26 —
// the attachment belongs to the authored message, not a swipe variant; a user turn has exactly one variant).
// CASCADE on message delete (link dies with its message); CASCADE on asset delete (the link is meaningless
// without its blob — the body text ref then degrades to literal markdown at render). `assetId` is registered
// RETAINING in `asset-refs.ts`, so an explicit asset delete is the ONLY way the row goes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const messageAssets = sqliteTable(
  "message_assets",
  {
    id: text("id").$type<MessageAssetId>().primaryKey(),
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-message lookup ("what did this message attach?") + the CASCADE parent index.
    index("message_assets_message_idx").on(t.messageId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_participants — the unified roster (D16). The per-kind SHAPE CHECK + the (chatId,userId) UNIQUE + the
// lifecycle columns are all born at table creation. `kind` derives the 4-member PARTICIPANT_KINDS. The D60
// kind-shape CHECK (agent-principal-design/02 §1) REPLACES the 2-way actor XOR so an `agent` (userId-backed AND
// AI-driven — the thing the XOR could not represent) is expressible: human/agent carry userId, character
// carries characterId, observer carries neither (reserved, un-seatable). `characterId` keys on identity (D28).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatParticipants = sqliteTable(
  "chat_participants",
  {
    id: text("id").$type<ChatParticipantId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // human | character | (observer — reserved). Derives PARTICIPANT_KINDS.
    kind: text("kind", { enum: PARTICIPANT_KINDS }).notNull(),
    // The actor — the per-kind SHAPE CHECK below fixes which is set: human/agent → userId, character →
    // characterId, observer → neither. userId CASCADE: a user hard-delete removes their memberships (D18);
    // an agent's owner-delete cascades the agent `users` row, which cascades its seats here. characterId
    // CASCADE: a deleted character leaves no roster ghost.
    userId: text("user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "cascade" }),
    // host | member — derives PARTICIPANT_ROLES. The host is the ONE authority + funding source (D18);
    // server-forced `member` on the invite-redeem chokepoint.
    role: text("role", { enum: PARTICIPANT_ROLES }).notNull(),
    // Per-participant active persona (the live `{{user}}` for this human's lines). SET NULL on delete.
    activePersonaId: text("active_persona_id")
      .$type<PersonaId>()
      .references(() => personas.id, { onDelete: "set null" }),
    // Natural-arbitration sampling weight (0–1, default 0.5).
    talkativeness: real("talkativeness").notNull().default(DEFAULT_TALKATIVENESS),
    // Muted: cards/WI still contribute but never arbiter-selected; excluded from `{{groupNotMuted}}`.
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    joinedAt: integer("joined_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Lifecycle horizons live in `messages.seq` (NOT the stream cursor). `leftSeq` null = present.
    joinSeq: integer("join_seq").notNull(),
    leftSeq: integer("left_seq"),
    // from-join | full — derives JOIN_HISTORY_VISIBILITIES (default from-join).
    joinHistoryVisibility: text("join_history_visibility", { enum: JOIN_HISTORY_VISIBILITIES }).notNull().default("from-join"),
  },
  (t) => [
    // No duplicate human membership; the re-join `ON CONFLICT(chatId,userId) DO UPDATE` target. userId is
    // nullable, so SQLite's UNIQUE ignores the character rows (multiple null-userId rows coexist).
    uniqueIndex("chat_participants_chat_user_unique").on(t.chatId, t.userId),
    index("chat_participants_chat_idx").on(t.chatId),
    // The multi-human bridge's junction read (`entry/compose/emit-character-updated.ts`): "every chat where
    // this character is a present seat" filters `characterId` with NO `chatId`, so neither the (chatId,userId)
    // unique nor `chat_participants_chat_idx` serves it — it table-scanned. House convention: every queried
    // characterId FK is indexed (roster_preset_members/chat_digest_speakers/gallery_items precedents).
    index("chat_participants_character_idx").on(t.characterId),
    // The per-kind SHAPE CHECK (D60; agent-principal-design/02 §1) — born at creation, REPLACES the 2-way
    // actor XOR. Each kind fixes its identity columns; `agent` shares the `human` column shape (userId, no
    // characterId) — the columns answer "which identity table", `kind` answers "who drives it" (the bit the XOR
    // could not carry). The DB does NOT cross-verify `kind='agent' ⇒ users.kind='agent'` (SQLite has no
    // cross-table CHECK); the ONE agent-seat chokepoint enforces that (agent-principal-design/02 §1 — FLAG[PD-17], AP3).
    check(
      "chat_participants_kind_shape",
      sql.raw(
        "(kind = 'human' AND user_id IS NOT NULL AND character_id IS NULL) OR (kind = 'character' AND character_id IS NOT NULL AND user_id IS NULL) OR (kind = 'agent' AND user_id IS NOT NULL AND character_id IS NULL) OR (kind = 'observer' AND user_id IS NULL AND character_id IS NULL)",
      ),
    ),
    check("chat_participants_kind_check", sql.raw(`kind in (${checkList(PARTICIPANT_KINDS)})`)),
    check("chat_participants_role_check", sql.raw(`role in (${checkList(PARTICIPANT_ROLES)})`)),
    check("chat_participants_join_visibility_check", sql.raw(`join_history_visibility in (${checkList(JOIN_HISTORY_VISIBILITIES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_invites — the membership chokepoint (D16). The token is CSPRNG-minted + STORED HASHED (never raw —
// mirrors the `sessions` token discipline); the hash is the constant-time lookup key (UNIQUE). Redeem is
// an atomic conditional `UPDATE … WHERE uses < maxUses AND not-expired RETURNING` (the maxUses TOCTOU).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatInvites = sqliteTable(
  "chat_invites",
  {
    id: text("id").$type<ChatInviteId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The peppered hash of the CSPRNG token — the raw token is NEVER persisted. UNIQUE = the lookup key.
    tokenHash: text("token_hash").notNull(),
    // Redemption cap (null = unlimited) + the running redemption count (the conditional-redeem guard).
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: integer("expires_at"),
    // Targeted-by-handle: the resolved invitee (null for an open share-link). SET NULL on user delete.
    invitedUserId: text("invited_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // pending | accepted | declined | revoked | expired — derives INVITE_STATUSES.
    status: text("status", { enum: INVITE_STATUSES }).notNull().default("pending"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("chat_invites_token_hash_unique").on(t.tokenHash),
    index("chat_invites_chat_idx").on(t.chatId),
    check("chat_invites_status_check", sql.raw(`status in (${checkList(INVITE_STATUSES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// pending_turns — a host-offline DEFERRED AI turn (Part III §5). NOT lock-held (the 5-min lock TTL would
// stale-takeover → double-run); boot-reclaimed + re-validated for consent/budget at drain. Carries the
// turn-identity split: `triggeredBy` (the responsible human) + `runAsUserId` (the authorized host).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const pendingTurns = sqliteTable(
  "pending_turns",
  {
    id: text("id").$type<PendingTurnId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The human RESPONSIBLE for the turn (spend budget + abort-rights + attribution) — D19.
    triggeredBy: text("triggered_by")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The authorized host whose box FUNDS the deferred turn (the frozen `runAsUserId`) — D19.
    runAsUserId: text("run_as_user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("pending_turns_chat_idx").on(t.chatId)],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_events — the DURABLE chat-bus log (the replay ring's source of truth; late-subscriber ramp-up). The
// `type` column is typed to the `ChatBusEvent` discriminant and CHECK-constrained to the SAME closed set
// (`CHAT_BUS_EVENT_TYPES` keys); `payload` is the full event. `seq` is the per-chat replay cursor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The bus discriminant set, derived from the contract's exhaustive `CHAT_BUS_EVENT_TYPES` map (its keys
// ARE the union members — `satisfies Record<ChatBusEvent["type"], true>` upstream guarantees completeness).
const CHAT_EVENT_TYPES = Object.keys(CHAT_BUS_EVENT_TYPES) as ChatBusEvent["type"][];

export const chatEvents = sqliteTable(
  "chat_events",
  {
    id: text("id").$type<ChatEventId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // Per-chat monotonic replay cursor (`lastEventId`). UNIQUE per chat.
    seq: integer("seq").notNull(),
    // The bus discriminant (denormalized `payload.type`) — typed to the union, CHECK-constrained to it.
    type: text("type").$type<ChatBusEvent["type"]>().notNull(),
    // The full closed bus event (room-public; the contract's allowlist makes secrets unrepresentable).
    payload: text("payload", { mode: "json" }).$type<ChatBusEvent>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("chat_events_chat_seq_unique").on(t.chatId, t.seq), check("chat_events_type_check", sql.raw(`type in (${checkList(CHAT_EVENT_TYPES)})`))],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_stream_events — the RESUMABLE SSE token log. Each row is one
// streamed delta; `seq` is the resume cursor (`replayStreamEvents`/`streamEventBounds`). `kind` mirrors the
// `ChatDeltaEvent` discriminant (text | reasoning) — tied to the contract wire type via `satisfies`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The stream-delta kind tuple — tied to the contract `ChatDeltaEvent["kind"]` (compile-time validity; a
// new delta kind fails this `satisfies` until the column learns it). No `z`-schema home exists for a
// runtime mirror, so the test asserts the column's `.enumValues` equals this tuple.
const STREAM_DELTA_KINDS = ["text", "reasoning"] as const satisfies readonly ChatDeltaEvent["kind"][];

export const chatStreamEvents = sqliteTable(
  "chat_stream_events",
  {
    id: text("id").$type<ChatStreamEventId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The message being streamed (nullable: a turn-level delta may precede the committed slot). CASCADE.
    messageId: text("message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "cascade" }),
    // Per-chat resume cursor (`lastEventId`). UNIQUE per chat.
    seq: integer("seq").notNull(),
    // text | reasoning — derives STREAM_DELTA_KINDS (tied to ChatDeltaEvent).
    kind: text("kind", { enum: STREAM_DELTA_KINDS }).notNull(),
    // The streamed chunk text.
    delta: text("delta").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("chat_stream_events_chat_seq_unique").on(t.chatId, t.seq),
    check("chat_stream_events_kind_check", sql.raw(`kind in (${checkList(STREAM_DELTA_KINDS)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_injections — the PERSISTED positional injections (the `ChatInjection` wire shape; one
// injection list). `position` is tied to the contract wire type; `role` derives MESSAGE_ROLES. Spliced
// per-turn into the prompt, NEVER into a `message_variants` row (transient-injection class).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The injection-position tuple — tied to the contract `ChatInjection["position"]` (compile-time validity).
// No `z`-schema home exists for a runtime mirror, so the test asserts the column's `.enumValues`.
const INJECTION_POSITIONS = ["before_prompt", "in_static", "in_prompt", "in_chat"] as const satisfies readonly ChatInjectionWire["position"][];

export const chatInjections = sqliteTable(
  "chat_injections",
  {
    id: text("id").$type<ChatInjectionId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // before_prompt | in_static | in_prompt | in_chat — derives INJECTION_POSITIONS.
    position: text("position", { enum: INJECTION_POSITIONS }).notNull(),
    // Only meaningful when position = in_chat. 0 = at the tail (just before the new turn).
    depth: integer("depth").notNull().default(0),
    // The injected block's role — the canonical MESSAGE_ROLES axis (no inline re-spell, D32).
    role: text("role", { enum: MESSAGE_ROLES }).notNull(),
    content: text("content").notNull(),
    // Priority WITHIN a depth (ST `injection_order`; co-located in_chat injections splice DESC). `order`
    // is a SQL keyword — the column is `injection_order`.
    order: integer("injection_order"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("chat_injections_chat_idx").on(t.chatId),
    check("chat_injections_position_check", sql.raw(`position in (${checkList(INJECTION_POSITIONS)})`)),
    check("chat_injections_role_check", sql.raw(`role in (${checkList(MESSAGE_ROLES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_locks — the per-chat turn lock (a DB-backed concurrency primitive co-located
// with the table it guards). PK is the NATURAL `chat_id` (one lock per chat) — NO TypeID brand on the PK
// (it is the chat's own id reused as the key). FK chats CASCADE (a deleted chat drops its lock).
// `expiresAt` is the LOCK_TTL_MS horizon (multi-replica stale-takeover defense; the TTL value is a domain
// constant, not a schema concern). Boot-reclaimed via `reclaimChatLocksOnBoot`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatLocks = sqliteTable("chat_locks", {
  // NATURAL PK: the chat's own ChatId reused as the lock key + a CASCADE FK to chats (brand flows the FK).
  chatId: text("chat_id")
    .$type<ChatId>()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  // The replica/holder that owns the lock (for multi-replica takeover diagnostics).
  holder: text("holder").notNull(),
  acquiredAt: integer("acquired_at").notNull(),
  // The TTL horizon — a stale lock past this is takeover-eligible (the LOCK_TTL_MS window).
  expiresAt: integer("expires_at").notNull(),
});
