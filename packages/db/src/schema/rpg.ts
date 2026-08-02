// schema/rpg — the RPG lite substrate's 5-table floor (producer: domain/rpg; rpg-design/05 §4.2). Born
// WHOLE: the full-mode shape ships as data/nullable columns from day one so full-mode arrival ADDS
// siblings (7 tables, nullable columns, tool defs) and renames/re-types/migrates NOTHING lite shipped
// (the graft-map invariant, §C). This is the W0 schema floor; the domain/rpg producer lands in W1 (until
// then this file rides the BASELINE_RIDER_PRODUCERS entry in the db-structure gate).
//
// D23-CLEAN: NO `ownerId` ANYWHERE. Authority derives through the chat FK chain — `rpg_games.chatId →
// chat_participants` (D18/D20); the host participant is the authority, gated at the producer verb. Every
// enum column derives its `@orb/contracts/rpg` tuple with a tuple-built CHECK (no re-spell); every JSON
// column is `$type<>`d and parse-on-read at the `@orb/db/kit` seam.
//
// THE SWIPE-VOLATILE PLANE (§2.4-2.5): `rpg_snapshots` is one row per assistant `message_variants` row
// that carried game-state writes (UNIQUE `variantId`, CASCADE) — a swipe rewinds BY CONSTRUCTION (each
// variant's snapshot is its own truth; `selectVariant` needs zero rpg code). Quests fold INTO the snapshot
// (a `quests` JSON array — clone-forward like inventory/cast). `rpg_journal` is the VARIANT-AWARE ARCHIVE:
// model entries stamp their producing `variantId` (CASCADE — a deleted swipe deletes its entries), hand
// entries stamp NULL (every lineage); the READ projects the selected-variant chain (D46 derive-don't-stamp).

import type { RpgActorEntry, RpgClockTime, RpgFieldLocks, RpgGameConfig, RpgPlot, RpgQuest, RpgSheet, RpgTrackerValues, RpgWeather } from "@orb/contracts/rpg";
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
  UserId,
} from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { characters } from "./character";
import { chats, messages, messageVariants } from "./chat";
import { presets } from "./preset";
import { users } from "./users";

// A CHECK list is a static DDL fragment derived from the canonical tuple (NOT re-spelled). A CHECK cannot
// carry bound parameters (the users.ts/chat.ts precedent).
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

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
    check("rpg_games_mode_check", sql.raw(`mode in (${checkList(RPG_GAME_MODES)})`)),
    check("rpg_games_status_check", sql.raw(`status in (${checkList(RPG_GAME_STATUSES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_snapshots — the swipe-volatile plane (§2.4-2.5). One row per assistant variant that carried
// game-state writes (variantId UNIQUE, CASCADE): a swipe rewinds by construction. Born WHOLE — full grafts
// ZERO columns here. `quests` folds INTO the snapshot (§2.5). `committed` births 0 at flush; the NEXT
// user send's `onUserCommit` locks it to 1. Ambient `clock`/`weather`/`calendarDate` are born nullable (§2.7).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const rpgSnapshots = sqliteTable(
  "rpg_snapshots",
  {
    id: text("id").$type<RpgSnapshotId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // The assistant variant this snapshot is keyed to — UNIQUE (one snapshot per variant), CASCADE (a
    // deleted swipe deletes its snapshot). The swipe-rewind mechanism: each variant's snapshot is its truth.
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .notNull()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
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
  (t) => [uniqueIndex("rpg_snapshots_variant_unique").on(t.variantId), index("rpg_snapshots_game_idx").on(t.gameId)],
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
    check("rpg_journal_type_check", sql.raw(`type in (${checkList(RPG_JOURNAL_TYPES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// rpg_checkpoints — a labeled snapshot bookmark (restore = clone forward). RESTRICT on snapshot delete:
// "restore broken because the snapshot vanished" must be a constraint error, not a silent dangle. Lite
// only ever writes trigger "manual"; full ADDS the session/combat arms (additive tuple). CHECK-derived.
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
    check("rpg_checkpoints_trigger_check", sql.raw(`trigger in (${checkList(RPG_CHECKPOINT_TRIGGERS)})`)),
  ],
);
