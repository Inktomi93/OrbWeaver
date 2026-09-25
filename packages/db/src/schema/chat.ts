// schema/chat — the chat cluster (producer: domain/chat; the biggest, most intricate slice). Fourteen tables:
// chats · messages · message_variants · message_assets · message_reactions · chat_participants ·
// chat_invites · pending_turns · chat_events ·
// chat_stream_events · chat_injections · chat_locks · chat_import_claims · chat_handoff_resumptions. Built
// WHOLE (no feature-phasing — ledger D16); the authoritative spec is `docs/law/Tier-1-DB.md`.
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
// `chat_injections.role` ← `MESSAGE_ROLES` (@orb/kit/message-role, D32); `messages.kind` ← `MESSAGE_KINDS`
// (the row-PURPOSE axis — @orb/contracts/chat; orthogonal to role, see the table header); `chat_participants.kind` ←
// `PARTICIPANT_KINDS` (`human`/`character` only post-rollback, 2026-07-25 purge — the DDL's `agent`/`observer`
// kind-shape CHECK arms below are dormant rebuild doorways, not live tuple members; docs/work/0048 tracks the graft),
// `.role` ← `PARTICIPANT_ROLES`, `joinHistoryVisibility` ←
// `JOIN_HISTORY_VISIBILITIES`; `chat_invites.status` ← `INVITE_STATUSES` (all @orb/contracts/chat).
// `chat_events.type` derives the DURABLE `ChatBusEvent` discriminant set (`CHAT_BUS_EVENT_TYPES` keys minus
// `LIVE_ONLY_CHAT_EVENT_TYPES` — the live-only lane is never appended, contracts/chat/bus.ts §3.4); the
// `chat_injections.position` + `chat_stream_events.kind` tuples are tied to the contract wire types
// (`satisfies`) — compile-time validity + a test-mirror over each column's `.enumValues`. Every CHECK is
// built from the SAME tuple as a static raw fragment (a CHECK is DDL — no bound parameters).
//
// Timestamps are plain `integer("x_at")` epoch-MS NUMBERS (contracts view timestamps as `number`), born at
// insert via `(unixepoch() * 1000)`; caller-set timestamps are required `integer` numbers. JSON columns
// are `$type<T>()` + read at the `@orb/db/kit` parse-seam (`chats.metadata` lazy/fault-isolated sub-blobs;
// `message_variants.params`/`promptSnapshot`/`metadata`). The `raw_request`/`raw_response` provider
// envelopes are DELETED (2026-08-03): nothing ever wrote them and the wire inspector reads `promptSnapshot`.

import type {
  AssembledPrompt,
  ChatBusEvent,
  ChatDeltaEvent,
  ChatInjection as ChatInjectionWire,
  ChatMetadata,
  ChatReasoningPart,
  CueRole,
  DurableChatBusEvent,
  HandoffOffer,
  MacroFreezeRecord,
  MessageAssetOrigin,
  StandaloneVariableDelta,
  TokenProvenance,
  ToolCallRecord,
  UserMacroDraws,
  VariantMetadata,
} from "@orb/contracts/chat";
import {
  CHAT_BUS_EVENT_TYPES,
  CUE_ROLES,
  INVITE_STATUSES,
  JOIN_HISTORY_VISIBILITIES,
  LIVE_ONLY_CHAT_EVENT_TYPES,
  MESSAGE_ASSET_ORIGINS,
  MESSAGE_KINDS,
  PARTICIPANT_KINDS,
  TOKEN_PROVENANCES,
  TURN_INITIATORS,
} from "@orb/contracts/chat";
// PARTICIPANT_ROLES is one-homed in @orb/contracts/identity (the can() resource-role axis).
import { AUTH_MODES, PARTICIPANT_ROLES } from "@orb/contracts/identity";
import type { CostDetails, NormalizedFinishReason, ProviderId } from "@orb/contracts/inference";
import { NORMALIZED_FINISH_REASONS } from "@orb/contracts/inference";
import type { EffortLevel, UserIntent, UserMacroValues } from "@orb/contracts/preset";
import { EFFORT_LEVELS } from "@orb/contracts/preset";
import type {
  AssetId,
  CharacterId,
  ChatEventId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  ChatStreamEventId,
  ChatStreamGenerationId,
  MessageAssetId,
  MessageId,
  MessageReactionId,
  MessageVariantId,
  ModelId,
  PendingTurnId,
  PersonaId,
  UserConnectionId,
  UserId,
} from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import * as sqliteCore from "drizzle-orm/sqlite-core";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { assets } from "./assets.ts";
import { characters } from "./character.ts";
import { userConnections } from "./connection.ts";
import { personas } from "./persona.ts";
import { users } from "./users.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chats — the membership-scoped room (D18: NO ownerId). The host participant is the authority. Carries the
// stable `{{user}}` anchor, the fork lineage pointer, the portable compaction checkpoint (D25), the pending
// host-handoff nominee (Part III §2), and the lazy-parsed room-behavior `metadata` blob.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The chat-room behavior blob (`ChatMetadata`) is one-homed in `@orb/contracts/chat` — the `$type` below
// and the domain's `parseChatMetadata` (the runtime fault-isolating parser) share that ONE shape.

// Natural-arbitration sampling weight (0–1); the born default for a new participant.
const DEFAULT_TALKATIVENESS = 0.5;

// The standalone (out-of-turn) runtime-variable delta batch shape (`StandaloneVariableDelta`)
// is one-homed in `@orb/contracts/chat` — the `$type` below imports it; typed
// JSON, parsed at the `@orb/db/kit` read seam (`standaloneVariableDeltaSchema`), never cast.

export const chats = sqliteTable(
  "chats",
  {
    // TypeID PK (`chat_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<ChatId>().primaryKey(),
    title: text("title"),
    // D18: NO `ownerId`. Membership (`chat_participants`) is the scope; the host is the authority.
    // D66: renamed from `star` — matches `characters.starred`/`personas.starred` (the report-cards
    // punch list item 6 rename; the RPC verb NAME `chat.star` is unchanged, only the data field).
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    // ST "Temporary Chat": an ephemeral room — persisted so turns can run, but HIDDEN from the
    // recent list (`listMemberChats` excludes it) and swept by `reapTemporaryChats` once expired. Set only
    // at `startChat` (a fork is born non-temporary). Expiry is a domain TTL over `createdAt`, not a column.
    temporary: integer("temporary", { mode: "boolean" }).notNull().default(false),
    // THE HUSK COLUMN (chat-creation draft-mode replacement, R0). NULL = a HUSK: the room was created but
    // never CLAIMED — nobody sent a line, ran a turn, or wrote any config into it. A husk is hidden from
    // `listMemberChats` for EVERYONE (the `temporary` lens twin, one arm below it in `memberChatScope`) and
    // is reap-eligible: best-effort on nav-away (`reapHusk`) and by the TTL belt inside `reapTemporaryChats`.
    // Non-null = the epoch-MS instant the room was claimed; a claimed room is a normal, listed chat forever.
    // The stamp is IDEMPOTENT and one-way (`domain/chat/persistence/claim.ts` — `UPDATE … WHERE started_at
    // IS NULL`), so the claim instant is the FIRST real activity, never the latest.
    // Born NULL at `startChat` ONLY. A fork and an ST import are born CLAIMED (they copy/write canon at mint,
    // so there is no unstarted state to represent) — both stamp it in their creation batch.
    // Also the FIRSTNESS gate: `characterSeatedInAnotherChat` requires a NOT-NULL `started_at` on the other
    // seat's chat, so a husk can never consume a character's "first chat" bump; the stats rebuild's chat
    // aggregations carry the SAME arm (the drift-gate contract — both writers must agree a husk counts zero).
    startedAt: integer("started_at"),
    // Two-party host handoff (Part III §2): the PENDING nominee, carried between `nominateHostHandoff` (the
    // host sets it) and `acceptHostHandoff` (the nominee — and ONLY the nominee — clears it on the atomic
    // role swap). One pending nomination per chat (a re-nominate overwrites). Null = no pending handoff.
    // SET NULL on user delete: a deleted nominee just clears the nomination, never deletes the chat (D18).
    pendingHostUserId: text("pending_host_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The departing host's OPT-IN property offer, co-located with the nominee it qualifies (stickler
    // 2026-08-03 §5): `nominateHostHandoff` writes it, `acceptHostHandoff` EXECUTES it and clears it in the
    // same statement that clears `pendingHostUserId` — the two are one nomination and can never outlive each
    // other. NULL = no offer = the built D64 drop, byte-identical. Typed JSON parsed at the `@orb/db/kit`
    // read seam (`handoffOfferSchema`), never cast: a corrupt blob degrades to no-offer rather than
    // fabricating consent to copy someone's library. Scoping class: INHERITED (D18/D20) — the row is the
    // chat, whose scope is `chat_participants`; the blob names no id and grants nothing by itself.
    pendingHandoffOffer: text("pending_handoff_offer", { mode: "json" }).$type<HandoffOffer>(),
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
    // `getVariablePicks` reads it back. A `{{var}}`→value map; typed JSON, parsed at the `@orb/db/kit` read
    // seam. Nullable (no variables flushed yet).
    variableValues: text("variable_values", { mode: "json" }).$type<Record<string, string>>(),
    // WAVE MU user-macro delivery — the per-chat user-macro INPUT picks (`setUserMacroValues` writes it,
    // the turn build reads it as the `values` bag). A NESTED macro→input→typed-pick map (string / boolean /
    // string[]), so it CANNOT share the flat `variableValues` column — its own typed JSON, parsed at the read
    // seam with `userMacroValuesSchema` (never cast). Nullable (no picks authored yet ⇒ the defaults posture).
    userMacroValues: text("user_macro_values", { mode: "json" }).$type<UserMacroValues>(),
    // DERIVED RUNTIME CACHE (D46 runtime plane): the O(1) materialization of `foldVarOps` over the selected-
    // variant chain's `message_variants.variable_delta`. Recomputed on every mutating event (turn commit / swipe
    // select / delete / fork); NOT authored directly. Distinct from `variableValues` (the config-plane store) —
    // the assembly env seed overlays THIS over the resolved config picks. Typed JSON; nullable (nothing folded yet).
    runtimeVariables: text("runtime_variables", { mode: "json" }).$type<Record<string, string>>(),
    // Monotonic replay cursor head. Stream-row cascades never rewind it; the writer advances it in the
    // same transaction as each appended row, so competing writers serialize on this DB-owned value.
    streamSeq: integer("stream_seq").notNull().default(0),
    // The standalone (out-of-turn) runtime-variable delta log — an
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
    // SQLite auto-indexes NOTHING for a child FK: every `DELETE FROM personas/users` must scan this table to
    // apply the SET NULL unless the referencing column LEADS an index (`fk-columns-indexed` gate).
    index("chats_anchor_persona_idx").on(t.anchorPersonaId),
    index("chats_pending_host_idx").on(t.pendingHostUserId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_import_claims — the scoped, atomic idempotency claim for an imported conversation. `importHash`
// alone cannot be unique on `chats`: identical source bytes may legitimately be imported for two different
// primary characters. The composite PK is therefore the exact operation scope. The row is inserted in the
// SAME batch as its chat; a concurrent loser rolls its whole candidate room back and resolves this claim.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatImportClaims = sqliteTable(
  "chat_import_claims",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    importHash: text("import_hash").notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    sqliteCore.primaryKey({ columns: [t.characterId, t.importHash], name: "chat_import_claims_scope_pk" }),
    index("chat_import_claims_chat_idx").on(t.chatId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_handoff_resumptions — one durable post-swap completion marker per room. The role swap inserts this
// row with the actor re-key payload; the accepted host may resume it after the nomination is already clear.
// `actorRekeys` is deliberately `unknown` at the DB package boundary and parsed by chat's read seam: the
// server-owned workflow shape must not become a second public contract merely to type a private JSON cell.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatHandoffResumptions = sqliteTable(
  "chat_handoff_resumptions",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .primaryKey()
      .references(() => chats.id, { onDelete: "cascade" }),
    acceptedByUserId: text("accepted_by_user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorRekeys: text("actor_rekeys", { mode: "json" }).$type<unknown>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("chat_handoff_resumptions_accepted_by_idx").on(t.acceptedByUserId)],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// messages — the PURE SLOT (D26). Identity + attribution + selection ONLY; NO content, NO economics. A
// swipe APPENDs a `message_variants` row and `selectVariant` flips `selectedVariantId` (pointer move, never
// a copy). Attribution is slot-level. NO `parentId` (D27). `characterId` keys on `characters.id` (D28).
//
// THE ATTRIBUTION INVARIANT (owner-ordered schema-hardening, 2026-07-17; D82 delete/recreate sanction).
// Derived exhaustively from EVERY `messages` writer — the engine persist (engine.ts `buildCommitPlan`,
// which supports a generic `new-slot role='user'` slot), the user-send (turn.ts `persistUserMessage`), the
// greeting seed (start-chat.ts), the image message (generate-image.ts `role='user'`), the fork deep-copy (fork.ts, a
// verbatim `...slot` copy), the edit-dup (edit.ts, a verbatim attribution copy), and the ST bulk-import
// (import-write.ts). The born per-role shape:
//   • role='user'      — authorUserId SET (the sender/importer), characterId NULL, personaId OPTIONAL.
//   • role='assistant' — characterId SET (character voice) XOR authorUserId SET (agent voice — an agent is
//                        a userId-backed principal, D60; round.ts stamps `persist.authorUserId`), never both;
//                        personaId NULL. A character round leaves `characterId` = the speaker; an agent round
//                        leaves `characterId` NULL + `authorUserId` = the agent's user id.
//   • role='system'    — NO current writer mints a system SLOT: `role='system'` lives only in prompt-assembly
//                        injections, never a canon row. Attribution therefore unconstrained-by-writer here.
//                        (TRUTH-REPAIR 2026-08-07: this line used to justify itself with "the narrator/
//                        `postNarratorMessage` op is unbuilt". That op IS built — `verbs/post-narrator-message.ts`
//                        — and it mints an ASSISTANT slot voiced by the synthetic group character, so it never
//                        was the reason. The claim about system slots is unaffected and still holds.)
// THE PURPOSE AXIS is `kind` (MESSAGE_KINDS), NOT this table's role/attribution pattern: the born kind per
// writer is `standard` everywhere except `postNarratorMessage` and the engine's narrator-round commit, which
// declare `narrator`. The fork/edit copies carry the source row's kind verbatim, like every other slot column.
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
    // THE PURPOSE AXIS (D26 rider; stickler 2026-08-08 canon-message-identity) — derives MESSAGE_KINDS
    // (@orb/contracts/chat). ORTHOGONAL to `role` and to attribution: a narrator row is kind='narrator' AND
    // role='assistant'. It exists because purpose used to be INFERRED from columns designed to degrade — the
    // attribution FKs are all `onDelete: 'set null'`, so deleting the synthetic group character silently
    // reclassified every narrator row as standard — and from the room's CURRENT `GroupConfig.output` dial,
    // which re-classified history the moment it moved. DEFAULT 'standard': every existing writer stays
    // byte-identical and the pre-launch baseline needs no backfill. Never a lookup key ⇒ no index.
    kind: text("kind", { enum: MESSAGE_KINDS }).notNull().default("standard"),
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
    // ── Turn origin — the automation cascade guard's depth source. TURN-PATH state
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
    // The four attribution/selection FKs. SQLite auto-indexes nothing for a child FK, so without these a
    // user/character/persona/variant delete scans the whole (largest) table to apply its SET NULL, and the
    // attribution reads ("this character's lines") scan too (`fk-columns-indexed` gate).
    index("messages_author_user_idx").on(t.authorUserId),
    index("messages_character_idx").on(t.characterId),
    index("messages_persona_idx").on(t.personaId),
    index("messages_selected_variant_idx").on(t.selectedVariantId),
    check("messages_role_check", sql.raw(`role in (${checkList(MESSAGE_ROLES)})`)),
    check("messages_kind_check", sql.raw(`kind in (${checkList(MESSAGE_KINDS)})`)),
    check("messages_initiator_check", sql.raw(`initiator in (${checkList(TURN_INITIATORS)})`)),
    // The one STRUCTURAL kind arm: a narrator row is an assistant-voiced row in canon (the wire may map it to
    // a `system` row on a capable model — that is a SHAPE-time projection, never a stored fact, so canon
    // stays provider-independent). `standard`/`comment` are unconstrained here beyond the attribution shape
    // below: a comment can be authored by a human, an agent or the narrator identity. Like every CHECK on
    // this table it must never abort an FK SET-NULL cascade — it reads `kind`/`role`, neither of which any
    // cascade touches, so it cannot.
    check("messages_kind_shape", sql.raw("(kind <> 'narrator' OR role = 'assistant')")),
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
    // ── RAW + FREEZE PROVENANCE (stickler 2026-08-08 §3 — the re-resolution substrate). ──
    // `content` above stays the ONE canonical post-transform text every consumer reads (D51) — these two
    // columns are pure provenance and change no existing behavior. `rawContent` is the pre-freeze,
    // pre-regex authored text (the composer draft / the raw model output before the AI_OUTPUT regex,
    // postProcess and the per-speaker clean). It is stored NON-NULL only when it DIFFERS from `content`, so a
    // body no transform touched — the overwhelming common case — costs nothing. NULL therefore means "no
    // distinct pre-transform text is served for this row", NOT "the authored text was identical": a content
    // write that is not the freeze (a hand edit, a continue undo/revert) CLEARS this pair because the body it
    // described is gone, and `verbs/fork.ts`'s host-plane strip nulls it on a member→host copy. The exact rule
    // + why the reverse reading is not claimed: `domain/chat/persistence/canon-write.ts`.
    // TRUST BOUNDARY (binding): both columns are HOST-PLANE. The receive transforms exist partly to STRIP
    // content (a host regex can remove hidden material), so serving pre-strip bytes to a member re-opens the
    // D110 §3.6 class — they ride the already host-gated variant wire view ONLY, never `MessageView`.
    rawContent: text("raw_content"),
    // The volatile-freeze RECORD: the ordered `{name, args?, value}` occurrences a commit baked into
    // `content` ({{roll}}/{{random}}/{{pick}}/the clock family). Written in the SAME batch as the variant
    // (the `macroDraws` discipline). Nullable JSON, parsed at the read seam with `macroFreezeRecordSchema`
    // (never cast); absent/null ⇒ nothing froze. Raw + record together make a variant's macro spans
    // re-derivable byte-exactly — which is what makes an intentional re-roll, a re-resolution against new
    // context, and a fix for the greeting-swipe gap possible at all.
    macroFreezes: text("macro_freezes", { mode: "json" }).$type<MacroFreezeRecord>(),
    reasoning: text("reasoning"),
    // The model's reasoning BLOCKS with their per-wire provenance (`ChatReasoningPart` — the `reasoning` arm of `ChatContentPart`: the
    // Anthropic signature / redacted payload, OpenRouter's `reasoning_details`) — the REPLAY MATERIAL the next leg
    // of a tool loop hands back so the provider verifies its own prior thinking (inference audit A1; the read
    // side is `carryReasoning`, §8.8). `reasoning` above stays the rendered TEXT a user reads; this column is
    // what the wire needs and is NULL when nothing replayable was emitted. Typed JSON, parsed at the read seam
    // (the converters refuse an unsigned block, so a malformed row degrades to "nothing to replay").
    reasoningParts: text("reasoning_parts", { mode: "json" }).$type<readonly ChatReasoningPart[]>(),
    // The exact cue SHAPE delivered ahead of this generation and the role it went out in, stamped together at
    // commit (both NULL when no cue was sent). A prefix-bound model binds its thinking to the prompt it saw, so the
    // carry replays both verbatim ahead of the reply (D262); re-deriving either from today's prose, roster or
    // settings would drop the thinking. HOST-PLANE: the cue is prompt material and rides no member view.
    cue: text("cue"),
    cueRole: text("cue_role", { enum: CUE_ROLES }).$type<CueRole>(),
    model: text("model").$type<ModelId>(),
    // ATTRIBUTION (inference program §5.3b): which of the user's connections generated this swipe. SET NULL —
    // a deleted connection never deletes history (`selectedVariantId`'s idiom); null on user-authored rows,
    // imports and edits. Routing is a `connection_bindings` row; attribution is HERE and outlives the row.
    connectionId: text("connection_id")
      .$type<UserConnectionId>()
      .references(() => userConnections.id, { onDelete: "set null" }),
    // The PROVIDER REGISTRY ID (`Resolved.provider.id`), denormalised on purpose so attribution reads need no
    // join. Validated at the producer against the registry, NO CHECK — a plugin provider id is runtime data
    // (§5.3c class 2). The ST import narrows an unparseable source value to NULL; `(unknown)` belongs only
    // to `model_stats.provider`, whose non-null natural key requires a sentinel.
    provider: text("provider").$type<ProviderId>(),
    // CHECK on the preset effort tuple (`EFFORT_LEVELS`, 7 members incl. `none`) — §5.3c class 1. The
    // APPLIED effort — what the wire actually carried in our vocabulary (`ChatResult.appliedEffort`), never the
    // requested intent (that lives in `params`): a transport that spells no effort field, a budget-mode turn or
    // an SDK vocabulary drop records NULL; a disabled-thinking turn records `none` (inference audit B1).
    reasoningEffort: text("reasoning_effort", { enum: EFFORT_LEVELS }).$type<EffortLevel>(),
    // ── Economics (all nullable — populated when the generation finishes). ──
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    tokenProvenance: text("token_provenance", { enum: TOKEN_PROVENANCES }).$type<TokenProvenance>().notNull().default("unrecorded"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    // The reasoning share of `tokensOut` where the wire reports it (Anthropic `output_tokens_details.thinking_tokens`,
    // OpenRouter `completion_tokens_details.reasoning_tokens`, the agent-sdk `thinking_tokens` frame); NULL when
    // unreported — never a fabricated 0 (inference audit B5).
    reasoningTokens: integer("reasoning_tokens"),
    costUsd: real("cost_usd"),
    // WHERE `costUsd` came from — the SAME tuple as `token_provenance` (never a second vocabulary): `measured` =
    // the transport's metadata (OR usage cost); `estimated` = catalog pricing × tokens, or the subscription's
    // notional SDK price; `unrecorded` otherwise. Rollups combine it with `combineTokenProvenance`.
    costProvenance: text("cost_provenance", { enum: TOKEN_PROVENANCES }).$type<TokenProvenance>().notNull().default("unrecorded"),
    // The cost BREAKDOWN behind `costUsd` (§5.3c class 3 — a typed JSON sidecar whose ONE parser is
    // `costDetailsSchema` at every read seam, never a cast): the inference phase split when a wire reports one or
    // the estimated arm derives one, and on a BYOK OpenRouter turn the gateway-fee / upstream-charge pair that
    // makes `costUsd` honest (OR's `cost` alone is the fee there, inference audit A4/B8). NULL when `costUsd` is.
    costDetails: text("cost_details", { mode: "json" }).$type<CostDetails>(),
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
    // CHECK on `NORMALIZED_FINISH_REASONS` (`stop|length|filter|tool|other`) — the per-wire raw → normalized
    // fold happens in the runtime; `stop_reason` below keeps the raw upstream word as provenance.
    finishReason: text("finish_reason", { enum: NORMALIZED_FINISH_REASONS }).$type<NormalizedFinishReason>(),
    stopReason: text("stop_reason"),
    terminalReason: text("terminal_reason"),
    // The HTTP status of a FAILED generation (diagnostics + the retry-survivor signal alongside
    // terminalReason). Nullable — null on a clean generation.
    apiErrorStatus: integer("api_error_status"),
    // D48 tool-call records — the model-emitted tool exchanges for this variant. Nullable JSON, parsed at
    // the read seam with `toolCallRecordSchema` (never cast).
    toolCalls: text("tool_calls", { mode: "json" }).$type<readonly ToolCallRecord[]>(),
    // D46 runtime plane — the ordered variable ops THIS variant applied (`{{setvar}}`/`{{incvar}}`/…). The chat
    // domain folds these along the selected-variant chain (`foldVarOps`) into `chats.runtime_variables`, so a
    // swipe/fork rewinds by re-folding (derive-don't-stamp — avoids the ST swipe-clobber issue #3263). Nullable JSON,
    // parsed at the read seam with `variableDeltaSchema` (never cast); absent/null ⇒ this variant mutated no vars.
    variableDelta: text("variable_delta", { mode: "json" }).$type<readonly VarOp[]>(),
    // WAVE MU user-macro delivery — the per-turn random-pick draw record (macro → input → drawn value).
    // Written at commit in the SAME batch as the variant; the swipe/continue path replays it byte-exact
    // (kit's `frozenDraws`) so a re-generation of this slot resolves the identical draw (freeze-at-commit,
    // the `{{roll}}` class). Nullable JSON, parsed at the read seam with `userMacroDrawsSchema` (never
    // cast); absent/null ⇒ this turn drew nothing.
    macroDraws: text("macro_draws", { mode: "json" }).$type<UserMacroDraws>(),
    // The recorded generation params (D26 `params (UserIntent)`) — typed JSON, parsed at the read seam.
    params: text("params", { mode: "json" }).$type<UserIntent>(),
    // The per-variant assembled-prompt snapshot (D26 — now works per swipe).
    promptSnapshot: text("prompt_snapshot", { mode: "json" }).$type<AssembledPrompt>(),
    genStartedAt: integer("gen_started_at"),
    genFinishedAt: integer("gen_finished_at"),
    // The PROVIDER's response id for this generation — OpenRouter's `gen-…` (the key `connection.generationCost`
    // settles the per-message cost with) or Anthropic's `msg_…` (the support handle a request is traced
    // by; inference audit B7). §5.3c class 4: declared-OPAQUE provenance, never compared, switched on or joined.
    // Null where the wire reports none (agent-sdk / a user-authored row). NOT an orbweaver-branded id.
    generationId: text("generation_id"),
    // ── Continue-undo state (preContinue* + lastContinuation* + reasoning twins — Tier-1-DB.md §chat). ──
    preContinueContent: text("pre_continue_content"),
    preContinueReasoning: text("pre_continue_reasoning"),
    lastContinuationContent: text("last_continuation_content"),
    lastContinuationReasoning: text("last_continuation_reasoning"),
    // The generation sidecar (§5.3c class 3): a PARSED JSON sidecar, never an open bag. `VariantMetadata`
    // (@orb/contracts/chat) is the closed shape both sides import — the measured reasoning window under
    // `VARIANT_METADATA_REASONING_MS_KEY`, the per-provider `providerMetadata` union, and the ST import's
    // declared-opaque `importResidue`. Every read goes through `parseVariantMetadata` (the `$type` states the
    // contract; the parse proves it). Closing this type is what brings the stats rollups'
    // `json_extract(metadata, '$.reasoning_duration')` under `open-json-column-key-parity` (#184): the gate
    // judges a column's `$type` and can never see inside a bag.
    metadata: text("metadata", { mode: "json" }).$type<VariantMetadata>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The swipe set + its position; idx is unique within a message.
    uniqueIndex("message_variants_message_idx_unique").on(t.messageId, t.idx),
    // The context-boundary self-FK: a message delete must find the variants pointing AT it to apply its
    // rule, and SQLite auto-indexes no child FK (`fk-columns-indexed` gate).
    index("message_variants_context_boundary_idx").on(t.contextBoundaryMessageId),
    // The SET-NULL parent scan on a connection delete (`fk-columns-indexed` gate).
    index("message_variants_connection_idx").on(t.connectionId),
    check("message_variants_token_provenance_check", sql.raw(`token_provenance in (${checkList(TOKEN_PROVENANCES)})`)),
    check("message_variants_cost_provenance_check", sql.raw(`cost_provenance in (${checkList(TOKEN_PROVENANCES)})`)),
    check("message_variants_finish_reason_check", sql.raw(`finish_reason is null or finish_reason in (${checkList(NORMALIZED_FINISH_REASONS)})`)),
    check("message_variants_reasoning_effort_check", sql.raw(`reasoning_effort is null or reasoning_effort in (${checkList(EFFORT_LEVELS)})`)),
    check("message_variants_cue_role_check", sql.raw(`cue_role is null or cue_role in (${checkList(CUE_ROLES)})`)),
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
    // WHY the link exists (`MESSAGE_ASSET_ORIGINS`): `attached` (a user upload) · `illustration` (a narrator
    // `/imagine` post) · `inline-reply` (a picture the model emitted mid-turn — the ONLY origin the wire-history
    // projection sends back as an assistant image part). NOT NULL, no default — every writer stamps it.
    origin: text("origin", { enum: MESSAGE_ASSET_ORIGINS }).$type<MessageAssetOrigin>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-message lookup ("what did this message attach?") + the CASCADE parent index.
    index("message_assets_message_idx").on(t.messageId),
    // The OTHER cascade parent: an asset delete (the only way this link dies — `assetId` is RETAINING in
    // asset-refs.ts) scans every row without this (`fk-columns-indexed` gate).
    index("message_assets_asset_idx").on(t.assetId),
    check("message_assets_origin_check", sql.raw(`origin in (${checkList(MESSAGE_ASSET_ORIGINS)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_participants — the unified roster (D16). The per-kind SHAPE CHECK + the (chatId,userId) UNIQUE + the
// lifecycle columns are all born at table creation. `kind` derives PARTICIPANT_KINDS (`human`/`character` live
// post-rollback). The D60 kind-shape CHECK (docs/plans/agent-principals/design.md) was built so an `agent` (userId-backed
// AND AI-driven — the thing a 2-way actor XOR could not represent) is expressible: its `agent`/`observer` SQL
// arms are DORMANT rebuild doorways kept in the DDL for the agent-principal program's return (docs/work/0048), not
// live kinds today. `characterId` keys on identity (D28).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const chatParticipants = sqliteTable(
  "chat_participants",
  {
    id: text("id").$type<ChatParticipantId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // human | character (live). Derives PARTICIPANT_KINDS; the DDL's `agent`/`observer` CHECK arms are
    // dormant rebuild doorways (docs/work/0048), not selectable values today.
    kind: text("kind", { enum: PARTICIPANT_KINDS }).notNull(),
    // The actor — the per-kind SHAPE CHECK below fixes which is set: human → userId, character →
    // characterId (the dormant `agent`/`observer` DDL arms would carry userId / neither, same shape rule).
    // userId CASCADE: a user hard-delete removes their memberships (D18). characterId CASCADE: a deleted
    // character leaves no roster ghost.
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
    // from-join | full — derives JOIN_HISTORY_VISIBILITIES. Default `full`: an invited member sees the room's
    // ENTIRE history (owner ruling) — `from-join` is the OPT-IN restriction a host chooses per participant,
    // never the ambient posture. `from-join` floors reads at the member's own `joinSeq`, INCLUSIVE (they see
    // the row AT their joinSeq).
    joinHistoryVisibility: text("join_history_visibility", { enum: JOIN_HISTORY_VISIBILITIES }).notNull().default("full"),
  },
  (t) => [
    // No duplicate human membership; the re-join `ON CONFLICT(chatId,userId) DO UPDATE` target. userId is
    // nullable, so SQLite's UNIQUE ignores the character rows (multiple null-userId rows coexist).
    uniqueIndex("chat_participants_chat_user_unique").on(t.chatId, t.userId),
    // ONE present host per chat, as PHYSICS (#390). The host is the chat's single authority + funding
    // source (D18) and every host-keyed read (roster projection, export scoping, handoff targeting) assumes
    // exactly one — until this index that was writer discipline only, and a double-host row double-counted
    // those reads (the #382 reader fix is the belt BELOW this; the index is the one above it, §2.3 — a
    // prose-only boundary is a wish). PARTIAL by both arms: `role='host'` leaves members unconstrained,
    // `left_seq is null` leaves the DEPARTED-host history (every prior host of the chat) unconstrained.
    // Compatible with `acceptHostHandoffSwapStatements` precisely because its statement order is
    // demote-present-host → promote-nominee: the seat is vacated before it is re-taken, inside one batch.
    uniqueIndex("chat_participants_chat_host_unique").on(t.chatId).where(sql`role = 'host' and left_seq is null`),
    index("chat_participants_chat_idx").on(t.chatId),
    // The multi-human bridge's junction read (`entry/compose/emit-character-updated.ts`): "every chat where
    // this character is a present seat" filters `characterId` with NO `chatId`, so neither the (chatId,userId)
    // unique nor `chat_participants_chat_idx` serves it — it table-scanned. House convention: every queried
    // characterId FK is indexed (chat_digest_speakers/gallery_items precedents).
    index("chat_participants_character_idx").on(t.characterId),
    // `userId` LEADING: the (chatId,userId) unique cannot serve either user-keyed path — "list my chats" is
    // pure membership (D18) and a user hard-delete cascades these rows — and SQLite only uses an index whose
    // LEFTMOST column is the one constrained (`fk-columns-indexed` gate).
    index("chat_participants_user_idx").on(t.userId),
    index("chat_participants_active_persona_idx").on(t.activePersonaId),
    // The per-kind SHAPE CHECK (D60; docs/plans/agent-principals/design.md) — born at creation to REPLACE the 2-way
    // actor XOR once `agent` returns (userId-backed AND AI-driven — the bit a plain XOR can't carry). Only the
    // `human`/`character` arms are LIVE post-rollback (2026-07-25 purge); the `agent`/`observer` arms are
    // DORMANT rebuild doorways — no code path writes `kind='agent'`/`'observer'` today, and the DB does not
    // (and per the design would not) cross-verify `kind='agent' ⇒ users.kind='agent'` (SQLite has no
    // cross-table CHECK) — that's the future agent-seat chokepoint's job (docs/plans/agent-principals/design.md,
    // AP3, docs/work/0048). Kept as DDL now so the rebuild doesn't need a second migration for a known shape.
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
// message_reactions — B6/MR0, one row per (variant, reactor seat, emoji). CANON, membership-visible, and
// deliberately NOT a JSON blob on the variant: reactions are MULTI-USER, and two members toggling the same
// message on a stored array is a lost-update race (a read-modify-write of the whole list). A junction makes
// every toggle ONE statement — an `INSERT … ON CONFLICT DO NOTHING` or a keyed `DELETE` — so it needs no turn
// lock and no arbitration (the whole write path, MA-2 §4/§5). Marinara's `extra.reactions` array is a
// single-user pattern and does not port.
//
// ANCHORED TO THE VARIANT, NOT THE SLOT (MA-2 Open-Q A, ruled variant-level). Content is
// `message_variants`-owned (D26): a swipe is a distinct generation with its own text, so "a reaction to this
// reply" only means anything against one swipe. A fresh regeneration starts with an empty set; swiping back
// shows that swipe's own reactions; the FK CASCADE drops them with the variant.
//
// THE REACTOR IS A SEAT (`chat_participants.id`, D80) — the five-plane unifier. One column covers a human
// member, a character (B7's `react` tool), and the reserved agent kind with no `reactorKind` discriminant,
// and a NON-MEMBER cannot react at all because they have no seat (D18). The reactor's identity is DATA, not
// the ownership key: scope DERIVES variantId → messages → chats → the roster (D23 derive-don't-stamp — the
// `gallery_items`/`character_tags` class), so there is no `ownerId` and no `chatId` here.
//
// THE SEGMENT ANCHOR (B7/MR3) is the nullable TRIO `(segment_index, segment_speaker, segment_snippet)` —
// a `parseSpeakerSpans` LINE index over the variant's STORED CANON, plus the span's own speaker label and
// its trimmed-head snippet. All three because the anchoring fitness suite proved the escalation: a bare
// index is not edit-stable, `(index, speaker)` is defeated by a same-speaker insert, and only a text
// fingerprint detects that silently-mis-targeting case (`tests/kit/speaker-label/anchoring.suite.test.ts`).
// The trio is written FROM THE SERVER'S OWN PARSE (`verbs/reactions.ts` — a member's claim is validated,
// never stored), and a stale trio DEGRADES to whole-message at read (kit `resolveSegmentAnchor`), so these
// columns gate nothing and can never mis-attach. NULL index = a whole-message reaction (the coarse/default
// arm, and every MR0-MR2 row).
//
// `emoji` IS PLAIN TEXT WITH NO CHECK, and that is a decision (see `@orb/contracts/chat/reactions`): the
// vocabulary is OPEN BY DESIGN — Open-Q D ruled CUSTOM (CAS-backed) emoji ship — so a tuple-derived CHECK
// would make the widening a second baseline squash. Validation is the wire enum + the verb's own re-parse.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: text("id").$type<MessageReactionId>().primaryKey(),
    // The ANCHOR (see the header). CASCADE: a deleted swipe takes its reactions with it, and a message/chat
    // delete reaches here through the variant's own cascade.
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .notNull()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    // WHO reacted, as a roster seat (D80). CASCADE: a member who is hard-deleted (or a character removed
    // from the roster) takes their reactions with them — unlike a MESSAGE, a reaction carries no authored
    // prose worth preserving past its author, so this is a CASCADE where `messages` uses SET NULL.
    reactorParticipantId: text("reactor_participant_id")
      .$type<ChatParticipantId>()
      .notNull()
      .references(() => chatParticipants.id, { onDelete: "cascade" }),
    // The unicode emoji, or (when custom emoji land) a `:name:` token. Plain TEXT — see the header.
    emoji: text("emoji").notNull(),
    // The custom-emoji image (D21 CAS) — BORN AND TYPED, written by nothing through MR0-MR2 (the wire is
    // unicode-only). It exists now because the pre-launch schema is baseline-SQUASHED: adding a column later
    // costs a whole merge window, and Open-Q D already ruled custom emoji ship. Registered RETAINING in
    // `domain/assets/persistence/asset-refs.ts` — a CAS column the ref registry cannot see is a blob the GC
    // reaps out from under a live reaction. SET NULL (never CASCADE): losing the art degrades the chip to
    // its token, it must not delete somebody's reaction.
    emojiImageAssetId: text("emoji_image_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    // The B7 segment-anchor trio (see the header). Nullable TOGETHER-OR-NOT (the CHECK below): NULL index
    // = whole-message; a non-null index always carries its snippet (speaker stays nullable — a narration
    // span's label is legitimately `null`).
    segmentIndex: integer("segment_index"),
    segmentSpeaker: text("segment_speaker"),
    segmentSnippet: text("segment_snippet"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // ONE reactor · ONE emoji · ONE target — as PHYSICS (a double-add is an `ON CONFLICT DO NOTHING` no-op,
    // a remove is a keyed DELETE; §2.3 the enforcer is the index). TWO PARTIAL uniques rather than one over
    // the nullable index, because SQLite treats NULLs as DISTINCT in a unique index — a single
    // `(…, segment_index)` unique would silently stop deduplicating every whole-message row, which is the
    // entire MR0 concurrency story. The whole-message arm IS the old MR0 unique, unchanged in effect; the
    // segment arm keys the same trio plus the index, so "😂 on Bob's line 2" and "😂 on the whole message"
    // are independent toggles (the Marinara/MA-2 §4 semantics).
    uniqueIndex("message_reactions_whole_message_unique").on(t.variantId, t.reactorParticipantId, t.emoji).where(sql`segment_index is null`),
    uniqueIndex("message_reactions_segment_unique").on(t.variantId, t.reactorParticipantId, t.emoji, t.segmentIndex).where(sql`segment_index is not null`),
    // The trio's coherence, born (the kind_shape precedent): an anchor is whole (index + snippet, speaker
    // free to be null) or absent whole — a row with a snippet and no index is unrepresentable.
    check(
      "message_reactions_segment_shape",
      sql.raw("(segment_index IS NULL AND segment_speaker IS NULL AND segment_snippet IS NULL) OR (segment_index IS NOT NULL AND segment_snippet IS NOT NULL)"),
    ),
    // The pill row's own read ("this variant's reactions") AND the variant CASCADE parent — the unique above
    // already LEADS with `variantId`, so SQLite serves both from it; this index would be redundant. The two
    // FKs that do NOT lead an index each get one (`fk-columns-indexed` gate): a participant delete and an
    // asset delete would otherwise scan the whole table to apply their rule.
    index("message_reactions_reactor_idx").on(t.reactorParticipantId),
    index("message_reactions_emoji_asset_idx").on(t.emojiImageAssetId),
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
    // D259 — the invite may create an account for a signed-out visitor, one per use.
    allowSignup: integer("allow_signup", { mode: "boolean" }).notNull().default(false),
    // The host who minted the invite; a signup redeem re-checks this user's standing (D259). SET NULL on user
    // delete, and a signup invite whose minter is gone refuses.
    createdByUserId: text("created_by_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The AUTH_MODE at mint; a signup redeem refuses under any other mode (D259). Null on a row minted before
    // the column existed, and never null on a signup row.
    mintMode: text("mint_mode", { enum: AUTH_MODES }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("chat_invites_token_hash_unique").on(t.tokenHash),
    index("chat_invites_chat_idx").on(t.chatId),
    // The targeted-invite FK: a user delete SET-NULLs these rows, and "my pending invites" reads by it
    // (`fk-columns-indexed` gate).
    index("chat_invites_invited_user_idx").on(t.invitedUserId),
    check("chat_invites_status_check", sql.raw(`status in (${checkList(INVITE_STATUSES)})`)),
    // #1378 item 7 — the redemption counters, physically. The `uses < max_uses` admission itself stays an
    // application conditional-UPDATE (the comment above `chat_invites` states why: it must be atomic with
    // the seat write), and this does NOT replace it. What it closes is the shape that guard cannot see: a
    // NEGATIVE `uses` makes an exhausted invite redeemable again, and a `max_uses <= 0` is a cap that
    // admits nobody — a link that looks live and refuses everyone. `null` max_uses stays the unlimited arm.
    check("chat_invites_uses_check", sql.raw("uses >= 0 and (max_uses is null or max_uses > 0)")),
    // D259 — a signup invite is untargeted, capped and expiring. The verb enforces the cap values; this holds
    // the shape against any writer.
    check("chat_invites_signup_shape", sql.raw("allow_signup = 0 OR (invited_user_id IS NULL AND max_uses IS NOT NULL AND expires_at IS NOT NULL)")),
    check("chat_invites_signup_mode", sql.raw("allow_signup = 0 OR mint_mode IS NOT NULL")),
    check("chat_invites_mint_mode_check", sql.raw(`mint_mode is null or mint_mode in (${checkList(AUTH_MODES)})`)),
    // The minter FK: a user delete SET-NULLs these rows (`fk-columns-indexed` gate).
    index("chat_invites_created_by_user_idx").on(t.createdByUserId),
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
  (t) => [
    index("pending_turns_chat_idx").on(t.chatId),
    // Both turn-identity FKs CASCADE on user delete; SQLite auto-indexes neither, so a user hard-delete
    // would scan the whole table twice (`fk-columns-indexed` gate).
    index("pending_turns_triggered_by_idx").on(t.triggeredBy),
    index("pending_turns_run_as_user_idx").on(t.runAsUserId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// chat_events — the DURABLE chat-bus log (the replay ring's source of truth; late-subscriber ramp-up). The
// `type` column is typed to the `DurableChatBusEvent` discriminant and CHECK-constrained to the SAME closed
// set (`CHAT_BUS_EVENT_TYPES` keys MINUS `LIVE_ONLY_CHAT_EVENT_TYPES`); `payload` is the full event. `seq` is
// the per-chat replay cursor.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// The DURABLE bus discriminant set, derived from the contract's exhaustive `CHAT_BUS_EVENT_TYPES` map (its
// keys ARE the union members — `satisfies Record<ChatBusEvent["type"], true>` upstream guarantees
// completeness) MINUS the live-only lane (`LIVE_ONLY_CHAT_EVENT_TYPES`, contracts/chat/bus.ts §3.4). A
// live-only member is fanned on the room's channel and NEVER appended here, so admitting it to the CHECK
// would declare a row shape no writer can produce. The CHECK is the SECOND belt: the first is the
// `DurableChatBusEvent` narrowing on both emit surfaces (`domain/chat/bus::emit`,
// `entry/compose/services::emitChatEvent`), which makes appending one a compile error.
const CHAT_EVENT_TYPES = (Object.keys(CHAT_BUS_EVENT_TYPES) as ChatBusEvent["type"][]).filter(
  (type): type is DurableChatBusEvent["type"] => !(LIVE_ONLY_CHAT_EVENT_TYPES as readonly string[]).includes(type),
);

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
    // The bus discriminant (denormalized `payload.type`) — typed to the union, CHECK-constrained to the
    // DURABLE subset. The column keeps the WIDE type deliberately: the write-side narrowing lives at the two
    // emit surfaces (`domain/chat/bus::emit` + `entry/compose/services::emitChatEvent`, both
    // `DurableChatBusEvent`), which is upstream of every writer, and narrowing here as well would force the
    // §3.6 member stamper — a D16-frozen file whose signature is the whole union — to be re-typed for no
    // additional coverage.
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
//
// The production writer lives in `domain/chat/persistence/stream-events.ts`. Generation commit appends
// its statements after the canon message statements in the same ordered database batch. Each row mints
// its own `ChatStreamEventId`; both reference arms are derived through the one server-trusted message
// root, and a missing or cross-chat root makes the whole batch fail before a stream row can persist.
//
// `loadStreamReplay`/`loadStreamBounds` (`domain/chat/persistence/queries.ts`) back the
// `replayStreamEvents`/`streamEventBounds` verbs (`domain/chat/verbs/read.ts`), including the D16
// join-history-floor clamp against this table. Historical nullable message rows remain readable below
// the clamp; the canonical generation writer always anchors new rows to the committed canon slot.
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
    // One provider generation, distinct from the message slot (swipe/continue reuse a slot). Nullable only
    // for pre-writer historical/control rows; the canonical append writer always stamps it.
    generationId: text("generation_id").$type<ChatStreamGenerationId>(),
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
    // The message CASCADE parent + the `loadStreamEvents` innerJoin on `messages.id` (queries.ts) — both
    // scan without it, and SQLite auto-indexes no child FK (`fk-columns-indexed` gate).
    index("chat_stream_events_message_idx").on(t.messageId),
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
  // @column-ok: DIAGNOSTIC-ONLY, deliberately write-only. Expiry/takeover reads `expiresAt` exclusively, so
  // nothing in the app ever reads this back. It is kept for MANUAL forensics on a probe copy of the db —
  // "when did this holder actually take the lock?" is unanswerable from `expiresAt` alone once LOCK_TTL_MS
  // changes, and a lock stuck across a takeover is exactly the incident where that question gets asked.
  acquiredAt: integer("acquired_at").notNull(),
  // The TTL horizon — a stale lock past this is takeover-eligible (the LOCK_TTL_MS window).
  expiresAt: integer("expires_at").notNull(),
});
