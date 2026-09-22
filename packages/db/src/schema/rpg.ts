// schema/rpg — the RPG lite substrate's 5-table floor (producer: domain/rpg). Born
// WHOLE: the full-mode shape ships as data/nullable columns from day one so full-mode arrival ADDS
// siblings (7 tables, nullable columns, tool defs) and renames/re-types/migrates NOTHING lite shipped
// (the graft-map invariant, §C). This is the schema floor; the domain/rpg producer lands later (until
// then this file rides the BASELINE_RIDER_PRODUCERS entry in the db-structure gate).
//
// D23-CLEAN: NO `ownerId` ANYWHERE. Authority derives through the chat FK chain — `rpg_games.chatId →
// chat_participants` (D18/D20); the host participant is the authority, gated at the producer verb. Every
// enum column derives its `@orb/contracts/rpg` tuple with a tuple-built CHECK (no re-spell); every JSON
// column is `$type<>`d and parse-on-read at the `@orb/db/kit` seam.
//
// THE SWIPE-VOLATILE PLANE (§2.4-2.5, D124): `rpg_snapshots` is VARIANT-KEYED IFF the row was produced by
// that variant's own TURN FLUSH (UNIQUE `variantId`, CASCADE) — a swipe rewinds BY CONSTRUCTION (each
// variant's snapshot is its own truth; `selectVariant` needs zero rpg code). Every OTHER write (the hand
// doors, resync, populate, checkpoint restore) is a HAND ROW: no message, no variant, ordered by
// `asOfMessageId` — the `rpg_journal.variantId IS NULL` precedent one plane over. Quests fold INTO the
// snapshot (a `quests` JSON array — clone-forward like inventory/cast). `rpg_journal` is the VARIANT-AWARE ARCHIVE:
// model entries stamp their producing `variantId` (CASCADE — a deleted swipe deletes its entries), hand
// entries stamp NULL (every lineage); the READ projects the selected-variant chain (D46 derive-don't-stamp).

import type {
  RpgActorEntry,
  RpgClockTime,
  RpgFieldLocks,
  RpgGameConfig,
  RpgPlot,
  RpgQuest,
  RpgRecordedToolCall,
  RpgSheet,
  RpgTrackerValues,
  RpgWeather,
} from "@orb/contracts/rpg";
import { RPG_CHECKPOINT_TRIGGERS, RPG_GAME_MODES, RPG_GAME_STATUSES, RPG_JOURNAL_TYPES } from "@orb/contracts/rpg";
import type {
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PresetId,
  RpgCheckpointId,
  RpgGameId,
  RpgJournalId,
  RpgSheetId,
  RpgSnapshotId,
  RpgTurnToolCallsId,
  UserId,
} from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { characters } from "./character.ts";
import { chats, messages, messageVariants } from "./chat.ts";
import { presets } from "./preset.ts";
import { users } from "./users.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_games — the TRUTH (§2.1). One row per chat (chatId UNIQUE, CASCADE): mode/status/config/state.
// Game-ness resolves server-side by this row, always. `gmUserId` is a born-whole SPINE slot (lite's own
// invariants read it — `gmUserId IS NULL` = seatless); `gmPresetId` is a LIVE lite KNOB (§4.11 #1 — the
// preset-override storage, born NULL = augment the user's own preset; full's create later SEEDS it). A
// nullable FK (SET NULL on preset delete) NOT a config-blob field — a blob presetId would dangle silently.
// Engine-state columns (morale/activeState/lootTable/activeMapId/world+story text/illustration counters)
// graft as ADD COLUMNs with their engines (§C).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgGames = sqliteTable(
  "rpg_games",
  {
    id: text("id").$type<RpgGameId>().primaryKey(),
    // The chat this game belongs to — UNIQUE (one game per chat), CASCADE (a deleted chat erases the game).
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The mode axis (§2.2). CHECK-derived; NO DB default (verb-supplied always — a default flip IS a re-spell).
    mode: text("mode", { enum: RPG_GAME_MODES }).notNull(),
    // Lifecycle status. CHECK-derived; NO DB default (lite mints "active"; the others are full's wizard states).
    status: text("status", { enum: RPG_GAME_STATUSES }).notNull(),
    sessionNumber: integer("session_number").notNull().default(1),
    // The GM seat holder — born nullable (lite is seatless; SET NULL on user delete). Full's seat resolve reads it.
    gmUserId: text("gm_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The preset-override KNOB (§4.11 #1) — nullable FK, SET NULL on preset delete (referential integrity is
    // why it is a COLUMN, not a config-blob field: a blob presetId dangles silently). NULL = augment the
    // user's own preset (lite's born default); full's create later SEEDS a GM-preset clone here.
    gmPresetId: text("gm_preset_id")
      .$type<PresetId>()
      .references(() => presets.id, { onDelete: "set null" }),
    // The full config blob (statProfile + lite dials). Typed JSON, parse-on-read at the `@orb/db/kit` seam.
    config: text("config", { mode: "json" }).$type<RpgGameConfig>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("rpg_games_chat_unique").on(t.chatId),
    // Both nullable seat/knob FKs are SET NULL parents: a user or preset delete must find the games
    // pointing at it, and SQLite auto-indexes no child FK (`fk-columns-indexed` gate).
    index("rpg_games_gm_user_idx").on(t.gmUserId),
    index("rpg_games_gm_preset_idx").on(t.gmPresetId),
    check("rpg_games_mode_check", sql.raw(`mode in (${checkList(RPG_GAME_MODES)})`)),
    check("rpg_games_status_check", sql.raw(`status in (${checkList(RPG_GAME_STATUSES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_snapshots — the swipe-volatile plane (§2.4-2.5, D124). TWO ARMS, pinned by a CHECK:
//   • TURN row — `message_id` + `variant_id` NOT NULL, `as_of_message_id` NULL. Written ONLY by the turn
//     flush, keyed to the variant that produced it (variantId UNIQUE among non-null: a swipe rewinds by
//     construction, each variant's snapshot is its own truth).
//   • HAND row — `message_id` + `variant_id` NULL, ordered by the nullable `as_of_message_id`. Written by
//     every non-turn write (the 7 hand doors' clone-forward, resyncFromStory, populateFromCharacter,
//     checkpoint restore). It posts NO message: a hand write is GAME-plane data and was never a message —
//     the empty-body "state anchor" slot it used to mint leaked onto every plane that reads canon (render,
//     export, digest, plugin, automation, fork, seed, SSE, counts) and had to be filtered seven times over.
//     The row class is now unspellable, and the shape is the `rpg_journal.variantId IS NULL` hand-entry
//     precedent applied one plane over.
// Born WHOLE — full grafts ZERO columns here. `quests` folds INTO the snapshot (§2.5). `committed` births 0
// at a turn flush; the NEXT user send's `onUserCommit` locks it to 1 (a hand row is born committed=1).
// Ambient `clock`/`weather`/`calendarDate` are born nullable (§2.7).
//
// ── THE LINEAGE INVARIANT, stated (#1380) ─────────────────────────────────────────────────────────────
// A row's THREE references must meet at ONE chat: `game_id`'s game, `message_id`'s message and
// `variant_id`'s variant all belong to the same `chats.id`. SQLite cannot express that as a constraint
// (a CHECK cannot join, and the FKs point at three different tables), so it is NOT enforced by the
// schema — and every writer on the tree satisfies it the stronger way: BY DERIVATION, never by
// validation. The turn, hand and fork arms take `gameId`/`messageId`/`variantId` off ONE
// `findEngagedGame(chatId)` result or one fork's own id maps, so a mismatched tuple is not rejected, it
// is UNCONSTRUCTIBLE. The import arm (`persistence/portability-write.ts`) is the one that inserts a
// caller-supplied pair verbatim, and it is safe because the PORTABLE form carries INDICES rather than
// ids: `remapRpg` (`domain/import/verbs/import-chat-bundle.ts`) can only resolve them against the target
// chat's freshly-minted `identity`, so a source-chat id has no path into the write.
//
// ENFORCER (constitution §2 — a boundary held by convention is a wish): the negative tests in
// the "cross-chat lineage invariant" blocks in `tests/server/domain/rpg/persistence/{snapshots,turn-tool-calls,checkpoints}.int.test.ts`, which plant a cross-chat pair and
// pin that today's writers refuse to produce it. A future arm that ACCEPTS a `(gameId, messageId)` pair
// inherits no belt from the schema — it must validate, and that suite is where it says so.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgSnapshots = sqliteTable(
  "rpg_snapshots",
  {
    id: text("id").$type<RpgSnapshotId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    // The assistant SLOT a TURN row flushed onto — NULL on a hand row (D124). CASCADE with its slot.
    messageId: text("message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "cascade" }),
    // The assistant variant a TURN row is keyed to — UNIQUE among non-null (one snapshot per variant),
    // CASCADE (a deleted swipe deletes its snapshot). The swipe-rewind mechanism: each variant's snapshot
    // is its truth. NULL on a hand row: a hand write has no variant to rewind with.
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    // A HAND row's ORDER STAMP: the chat's tail slot at write time (NULL = the game was turnless, so the
    // row orders before all history — exactly "state as of before the story started"). SET NULL, never
    // CASCADE: a deleted as-of slot degrades this row's ORDERING, it must never delete durable game state
    // (the old anchor slot's CASCADE was the "NEVER delete an anchor" footgun). NULL on a turn row, which
    // carries its own `message_id` instead.
    asOfMessageId: text("as_of_message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "set null" }),
    // Ambient (§2.7) — engine-shaped storage, born nullable. Lite writes clock via the TIME_OF_DAY label.
    clock: text("clock", { mode: "json" }).$type<RpgClockTime>(),
    calendarDate: text("calendar_date"),
    location: text("location").notNull().default(""),
    weather: text("weather", { mode: "json" }).$type<RpgWeather>(),
    // The PRESENCE plane (R2) — the `actorRefKey`s standing in the scene. It carried the cast NPC's whole
    // identity row until R2 made the NPC an actor; the column name stays (no DDL, no re-spell).
    presentCharacters: text("present_characters", { mode: "json" }).$type<readonly string[]>(),
    recentEvents: text("recent_events", { mode: "json" }).$type<readonly string[]>(),
    // Per-actor state — identity (cast only) + the volatile half (trackers/conditions/inventory/wallet/status);
    // the wallet/inventory-first-class plane, and since R2 the ONE home for a cast NPC's whole person.
    actorState: text("actor_state", { mode: "json" }).$type<readonly RpgActorEntry[]>(),
    // GAME-SUBJECT tracker VALUES, keyed by tracker `key` (the tracked-field unification). Replaces
    // `widget_values`, which keyed by widget LABEL against defs in a whole separate table — both gone.
    trackerValues: text("tracker_values", { mode: "json" }).$type<RpgTrackerValues>(),
    // The swipe-consistent quest plane (§2.5) — folded into the snapshot, clone-forward like inventory/cast.
    // NULLABLE DESPITE THE `'[]'` DEFAULT, and that is ACCEPTED rather than a defect (#1378 item 10): a
    // writer that states the column explicitly can still store NULL, so readers pay a coalesce. They ALL
    // pay it, consistently and deliberately — `contract/service.ts`, `persistence/portability-write.ts` and
    // `persistence/snapshots.ts` each read `quests ?? []`. Making it NOT NULL would be the tidier shape and
    // is not worth a baseline squash on its own; the tax is real, uniform and paid.
    quests: text("quests", { mode: "json" }).$type<readonly RpgQuest[]>().default(sql`'[]'`),
    // The P5 plot plane (parity-plus — snapshot-resident `{act,title,acts}`, clone-forward like quests;
    // the act rail's datum). Born nullable: null = no plot authored yet.
    plot: text("plot", { mode: "json" }).$type<RpgPlot>(),
    // Manual-edit-wins locks — a presence-key record; only `editSnapshot` writes it, tools honor it. Nullable.
    fieldLocks: text("field_locks", { mode: "json" }).$type<RpgFieldLocks>(),
    // Born 0 at flush; the next user send's `onUserCommit` locks it to 1 (the commit lifecycle).
    committed: integer("committed").notNull().default(0),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // PARTIAL unique: one snapshot per variant on the TURN arm; hand rows (variant NULL) are unconstrained.
    uniqueIndex("rpg_snapshots_variant_unique").on(t.variantId).where(sql`variant_id is not null`),
    index("rpg_snapshots_game_idx").on(t.gameId),
    // The message CASCADE parent — deleting a message must find its snapshots, and nothing here leads with
    // `messageId` (`fk-columns-indexed` gate).
    index("rpg_snapshots_message_idx").on(t.messageId),
    // The as-of SET NULL parent — a message delete must find the hand rows stamped at it, and this column
    // leads nothing else (`fk-columns-indexed` gate). Also the ladder's ordering join.
    index("rpg_snapshots_as_of_message_idx").on(t.asOfMessageId),
    // THE TWO-ARM SHAPE (D124), the `rpg_sheets` actor-XOR idiom: message and variant are present together
    // or absent together (turn vs hand), and a TURN row never carries an as-of stamp (it IS its position).
    check("rpg_snapshots_arm_check", sql.raw("(message_id is null) = (variant_id is null) and (message_id is null or as_of_message_id is null)")),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_sheets — per-actor IDENTITY data, keyed by durable actor identity (characterId XOR userId), NOT
// membership (§4.3 — deliberately REPLACES legacy `rpg_party`, the no-party-system ruling made schema).
// No join/leave verbs, no provenance, no horizon columns. Read verbs project roster ∪ sheets; a row is
// created on FIRST WRITE. Full grafts `arc` as an ADD COLUMN with session wraps.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgSheets = sqliteTable(
  "rpg_sheets",
  {
    id: text("id").$type<RpgSheetId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    // The actor: characterId XOR userId (the CHECK below enforces the XOR). CASCADE on identity delete —
    // a sheet is subordinate to its actor's identity (never retained past a hard delete of the character/user).
    characterId: text("character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    sheet: text("sheet", { mode: "json" }).$type<RpgSheet>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("rpg_sheets_game_character_unique").on(t.gameId, t.characterId),
    uniqueIndex("rpg_sheets_game_user_unique").on(t.gameId, t.userId),
    // Both actor FKs sit SECOND in their (gameId, …) unique, and SQLite only uses an index whose LEFTMOST
    // column is the constrained one — so a character/user hard-delete scanned every sheet to CASCADE
    // (`fk-columns-indexed` gate).
    index("rpg_sheets_character_idx").on(t.characterId),
    index("rpg_sheets_user_idx").on(t.userId),
    // Exactly one of characterId/userId is set (the actor XOR — a sheet keys one durable identity).
    check("rpg_sheets_actor_xor_check", sql.raw("(character_id is null) + (user_id is null) = 1")),
  ],
);

// The `rpg_hud_widgets` table is GONE (the tracked-field unification, owner-approved 2026-07-31). Custom
// widgets were the game-subject arm of ONE concept whose other three arms lived in JSON blobs; they now ride
// `config.trackers[]` with `subject:"game"`, and their values ride `rpg_snapshots.tracker_values`. Dropped at
// the baseline regen (pre-launch squash) — no incremental migration, no compat read.

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_journal — the VARIANT-AWARE ARCHIVE (§2.5, ratification #1). Model entries stamp their producing
// `variantId` (CASCADE — an entry whose swipe died is unreachable forever; keeping it is a leak, not
// history); hand entries stamp NULL (every lineage — room truth). The READ projects the active lineage
// (variantId IS NULL OR variant = the slot's selectedVariantId) — the derive-don't-stamp discipline, no
// materialized visibility bit. `sourceMessageId` SET NULL (the message may be edited/removed; the entry
// survives). CHECK-derived type.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgJournal = sqliteTable(
  "rpg_journal",
  {
    id: text("id").$type<RpgJournalId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    type: text("type", { enum: RPG_JOURNAL_TYPES }).notNull(),
    // R4c — the free gloss carried by a `custom`-typed entry (the `relationship.label` shape). Born "" on the
    // seven built-in types; the CHECK above keeps `type` closed, and this is the escape the closed enum needs.
    label: text("label").notNull().default(""),
    title: text("title").notNull(),
    content: text("content").notNull(),
    // NULL = hand/room entry (every lineage); non-null = model entry, rendered only while its variant is
    // the slot's selected variant (§2.5). CASCADE on variant delete (the dead-swipe leak is deliberate).
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("rpg_journal_game_variant_idx").on(t.gameId, t.variantId),
    // `variantId` leads nothing (it is second in the game index), and `sourceMessageId` leads nothing at
    // all: a variant CASCADE and a message SET NULL both scanned the whole archive (`fk-columns-indexed`).
    index("rpg_journal_variant_idx").on(t.variantId),
    index("rpg_journal_source_message_idx").on(t.sourceMessageId),
    check("rpg_journal_type_check", sql.raw(`type in (${checkList(RPG_JOURNAL_TYPES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_turn_tool_calls — WHAT THE MODEL DID on a folded turn (TOOLCALLS-INVISIBLE, arm A). ONE row per
// producing VARIANT, holding that turn's whole call list as JSON — or, when the round could not run at all,
// an EMPTY list beside the `failure` sentence (#1468 item 2; see that column).
//
// WHY AN RPG-OWNED TABLE AND NOT `message_variants.tool_calls`: that column is chat's, typed
// `ToolCallRecord[]` and read by the transcript's existing tool renderer — exactly the right SHAPE, which is
// what makes it the trap. D112 rules that chat "NEVER RESOLVES, EXECUTES, OR RECURSES on [terminal tools],
// and never persists their calls as `ToolCallRecord`s — the co-emitted `tool_calls` are handed straight back
// to the contributor". Filling chat's column from rpg would reverse that ruling while looking like
// compliance, and would change what `MessageView.toolCalls` MEANS for every reader. The CONTRIBUTOR
// recording its OWN calls is the clause working as written.
//
// ONE ROW PER TURN, NOT PER CALL: a turn's calls are one atomic thing (they are folded together, they fail
// together, they are read together), and the per-variant unique is what makes a swipe surface its own calls
// with no visibility bit to maintain — the `rpg_snapshots` variant-keying, one plane over.
//
// CASCADE on the variant, like `rpg_journal`'s model entries: a record whose swipe died is unreachable
// forever, so keeping it is a leak rather than history.
//
// LINEAGE (#1380): `game_id`, `message_id` and `variant_id` must meet at ONE chat, exactly as on
// `rpg_snapshots` — and for the same reason it is not a constraint (a CHECK cannot join three tables).
// Held by DERIVATION at every writer; the enforcer is
// the "cross-chat lineage invariant" block in `tests/server/domain/rpg/persistence/turn-tool-calls.int.test.ts`. `rpg_snapshots`'s header states
// the rule in full; do not re-derive it, and do not add an accept-shaped writer without validating.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgTurnToolCalls = sqliteTable(
  "rpg_turn_tool_calls",
  {
    id: text("id").$type<RpgTurnToolCallsId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    // The assistant SLOT these calls rode. CASCADE with the slot (the calls describe that turn and nothing
    // else); mirrors `rpg_snapshots.message_id` rather than the journal's SET NULL, because unlike a journal
    // entry this row has no meaning once its turn is gone.
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // The producing variant — UNIQUE (one record per swipe) and CASCADE.
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .notNull()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    // The turn's calls: name + args VERBATIM + the fold's per-call verdict. The shape is `contracts/rpg`'s
    // (`RpgRecordedToolCall`), produced by the ONE `recordToolCalls` projection the warn and the flight
    // recorder also read — so the row, the log and the ring cannot disagree about what was lost.
    calls: text("calls", { mode: "json" }).$type<readonly RpgRecordedToolCall[]>().notNull(),
    // THE ROUND COULD NOT RUN (#1468 item 2) — the sentence saying why, NULL on every turn whose vehicle
    // reached a verdict (including the quiet one). A TURN-level column and not a synthesized `calls` entry:
    // that array is "what the MODEL called, args verbatim" and a failed round has no call to report, so
    // fabricating one would put a tool call the model never made in front of the reader. This is the durable
    // half of the fix — a provider throw used to leave nothing but a transient warn line, and the person whose
    // state update went missing had no way to learn it happened.
    failure: text("failure"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One record per variant — the swipe-rewind key.
    uniqueIndex("rpg_turn_tool_calls_variant_unique").on(t.variantId),
    // The read is per-GAME, newest first (the transcript window).
    index("rpg_turn_tool_calls_game_idx").on(t.gameId),
    // The message CASCADE parent — a message delete must find its records, and `messageId` leads nothing
    // else here (`fk-columns-indexed` gate).
    index("rpg_turn_tool_calls_message_idx").on(t.messageId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_checkpoints — a labeled snapshot bookmark (restore = clone forward). RESTRICT on snapshot delete:
// "restore broken because the snapshot vanished" must be a constraint error, not a silent dangle. Lite
// only ever writes trigger "manual"; full ADDS the session/combat arms (additive tuple). CHECK-derived.
//
// LINEAGE (#1380): `game_id` and `snapshot_id`'s OWN `game_id` must be the same game — two FKs to two
// tables, which SQLite cannot pair. Unlike the derive-only arms this pair IS caller-supplied on the
// restore path, and it IS validated there: `verbs/game/restore-checkpoint.ts` compares
// `checkpoint.gameId !== game.id` before use. Enforcer: that guard's suite plus
// the "cross-chat lineage invariant" block in `tests/server/domain/rpg/persistence/checkpoints.int.test.ts`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgCheckpoints = sqliteTable(
  "rpg_checkpoints",
  {
    id: text("id").$type<RpgCheckpointId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .$type<RpgSnapshotId>()
      .notNull()
      .references(() => rpgSnapshots.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    trigger: text("trigger", { enum: RPG_CHECKPOINT_TRIGGERS }).notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("rpg_checkpoints_game_idx").on(t.gameId),
    // The snapshot FK is RESTRICT: every snapshot delete must PROBE this table to decide whether to refuse,
    // and without a leading index that probe is a full scan (`fk-columns-indexed` gate).
    index("rpg_checkpoints_snapshot_idx").on(t.snapshotId),
    check("rpg_checkpoints_trigger_check", sql.raw(`trigger in (${checkList(RPG_CHECKPOINT_TRIGGERS)})`)),
  ],
);
