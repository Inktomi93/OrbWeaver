// schema/rpg — the rpg campaign tables (producer: domain/rpg, D58; specced in rpg-design/03). 14 tables
// born WHOLE into the `0000_baseline` (the decide-before-launch economics — later rpg chunks add NO
// tables; every reserved column exists from day one). All D23-CLEAN: authority derives through
// `rpg_games.chatId → chat_participants` membership (D18/D20) — NO `ownerId` on any rpg table.
//
// The governing split (rpg-design/03): per-SWIPE volatile state → rpg_snapshots (keyed on
// message_variants, D26); per-GAME campaign canon → rpg_games + satellites (real tables, never a
// metadata blob); per-SESSION heartbeat → rpg_sessions.
//
// Enum columns DERIVE their ONE canonical tuple from `@orb/contracts/rpg` (D34 — the tuples were
// promoted so `@orb/db` can import them; db deps are kit + contracts + drizzle only) with a tuple-built
// CHECK (static DDL, users.ts/workloads.ts pattern). Every JSON text column is `.$type<T>()`d to a
// contract type and is parse-on-read/serialize-on-write through its zod schema in domain/rpg (R2).

import type {
  RpgCheckResult,
  RpgClockTime,
  RpgCombatSummary,
  RpgEncounterState,
  RpgFieldLocks,
  RpgGameConfig,
  RpgLootTable,
  RpgMapData,
  RpgPartyArc,
  RpgPartyVolatile,
  RpgPresentCharacter,
  RpgQuestObjective,
  RpgScenePlan,
  RpgSessionSummary,
  RpgSheet,
  RpgWeather,
  RpgWidgetBinding,
  RpgWidgetValues,
} from "@orb/contracts/rpg";
import {
  RPG_ACTIVE_STATES,
  RPG_CHECKPOINT_TRIGGERS,
  RPG_CLOCK_KINDS,
  RPG_CLOCK_SEGMENTS,
  RPG_CLOCK_STATUSES,
  RPG_CLOCK_VISIBILITIES,
  RPG_ENCOUNTER_STATUSES,
  RPG_GAME_STATUSES,
  RPG_JOURNAL_TYPES,
  RPG_MAP_KINDS,
  RPG_NPC_DESCRIPTION_SOURCES,
  RPG_PARTY_PROVENANCES,
  RPG_PENDING_CHECK_REQUESTERS,
  RPG_PENDING_CHECK_STATUSES,
  RPG_QUEST_STATUSES,
  RPG_SCENE_STATUSES,
  RPG_SESSION_STATUSES,
  RPG_WIDGET_POSITIONS,
  RPG_WIDGET_TYPES,
} from "@orb/contracts/rpg";
import type {
  AssetId,
  CharacterId,
  ChatId,
  MessageId,
  MessageVariantId,
  PresetId,
  RpgCheckpointId,
  RpgClockId,
  RpgEncounterId,
  RpgGameId,
  RpgJournalId,
  RpgMapId,
  RpgNpcId,
  RpgPartyMemberId,
  RpgPendingCheckId,
  RpgQuestId,
  RpgSceneId,
  RpgSessionId,
  RpgSnapshotId,
  RpgWidgetId,
  UserId,
} from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { characters } from "./character";
import { chats, messages, messageVariants } from "./chat";
import { presets } from "./preset";
import { users } from "./users";

// CHECK list from a canonical tuple (NOT re-spelled) — static DDL fragment.
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}
// Numeric-membership CHECK (clock segments in (4,6,8,12)).
const CLOCK_SEGMENTS_LIST = RPG_CLOCK_SEGMENTS.join(", ");

// Numeric bound constants (SQL CHECK ranges — rpg-design/03).
const MORALE_MIN = 0;
const MORALE_MAX = 100;
const MORALE_DEFAULT = 50;
const REPUTATION_MIN = -100;
const REPUTATION_MAX = 100;
const DC_MIN = 2;
const DC_MAX = 30;

// ═══ 1. rpg_games — the campaign root (one per chat) ══════════════════════════════════════════════════
export const rpgGames = sqliteTable(
  "rpg_games",
  {
    id: text("id").$type<RpgGameId>().primaryKey(),
    // One game per chat; the game dies with the chat.
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    status: text("status", { enum: RPG_GAME_STATUSES }).notNull().default("setup"),
    sessionNumber: integer("session_number").notNull().default(1),
    // The GM SEAT (doc 12 §1): NULL = the AI holds the seat (narrator); non-null = a human GM.
    gmUserId: text("gm_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The game's GM voice (02 §1.1 #1 — the domain-of-affect home; a chats-side binding is REJECTED).
    gmPresetId: text("gm_preset_id")
      .$type<PresetId>()
      .references(() => presets.id, { onDelete: "set null" }),
    config: text("config", { mode: "json" }).$type<RpgGameConfig>().notNull(),
    worldOverview: text("world_overview").notNull().default(""),
    // HIDDEN — GM-only narrative spine.
    storyArcSecret: text("story_arc_secret").notNull().default(""),
    // HIDDEN — the twist bank.
    plotTwists: text("plot_twists", { mode: "json" })
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'`),
    artStylePrompt: text("art_style_prompt").notNull().default(""),
    // The one active map (forward FK — rpg_maps is defined below; the thunk resolves it).
    activeMapId: text("active_map_id")
      .$type<RpgMapId>()
      .references((): AnySQLiteColumn => rpgMaps.id, { onDelete: "set null" }),
    morale: integer("morale").notNull().default(MORALE_DEFAULT),
    activeState: text("active_state", { enum: RPG_ACTIVE_STATES }).notNull().default("exploration"),
    lootTable: text("loot_table", { mode: "json" }).$type<RpgLootTable>(),
    lastIllustrationTurn: integer("last_illustration_turn"),
    lastIllustrationSession: integer("last_illustration_session"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("rpg_games_chat_unique").on(t.chatId),
    check("rpg_games_status_check", sql.raw(`status in (${checkList(RPG_GAME_STATUSES)})`)),
    check(
      "rpg_games_active_state_check",
      sql.raw(`active_state in (${checkList(RPG_ACTIVE_STATES)})`),
    ),
    check("rpg_games_morale_check", sql.raw(`morale between ${MORALE_MIN} and ${MORALE_MAX}`)),
  ],
);

// ═══ 2. rpg_snapshots — the per-swipe tracker (keyed on message_variants, D26) ════════════════════════
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
    // THE swipe key — one snapshot per variant.
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .notNull()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    clock: text("clock", { mode: "json" }).$type<RpgClockTime>().notNull(),
    calendarDate: text("calendar_date"),
    location: text("location").notNull().default(""),
    weather: text("weather", { mode: "json" }).$type<RpgWeather>(),
    presentCharacters: text("present_characters", { mode: "json" })
      .$type<readonly RpgPresentCharacter[]>()
      .notNull()
      .default(sql`'[]'`),
    recentEvents: text("recent_events", { mode: "json" })
      .$type<readonly string[]>()
      .notNull()
      .default(sql`'[]'`),
    partyState: text("party_state", { mode: "json" })
      .$type<readonly RpgPartyVolatile[]>()
      .notNull()
      .default(sql`'[]'`),
    widgetValues: text("widget_values", { mode: "json" })
      .$type<RpgWidgetValues>()
      .notNull()
      .default(sql`'{}'`),
    fieldLocks: text("field_locks", { mode: "json" }).$type<RpgFieldLocks>(),
    committed: integer("committed").notNull().default(0),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [uniqueIndex("rpg_snapshots_variant_unique").on(t.variantId)],
);

// ═══ 3. rpg_npcs — the living cast ════════════════════════════════════════════════════════════════════
export const rpgNpcs = sqliteTable(
  "rpg_npcs",
  {
    id: text("id").$type<RpgNpcId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("🧑"),
    description: text("description").notNull().default(""),
    descriptionSource: text("description_source", { enum: RPG_NPC_DESCRIPTION_SOURCES }),
    gender: text("gender"),
    pronouns: text("pronouns"),
    location: text("location").notNull().default("Unknown"),
    reputation: integer("reputation").notNull().default(0),
    notes: text("notes", { mode: "json" }).$type<readonly string[]>().notNull().default(sql`'[]'`),
    // Generated portrait (08) — a CAS asset, SET NULL on asset delete.
    avatarAssetId: text("avatar_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    // Set when the NPC is promoted/recruited from/to the library.
    characterId: text("character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check(
      "rpg_npcs_description_source_check",
      sql.raw(`description_source in (${checkList(RPG_NPC_DESCRIPTION_SOURCES)})`),
    ),
    check(
      "rpg_npcs_reputation_check",
      sql.raw(`reputation between ${REPUTATION_MIN} and ${REPUTATION_MAX}`),
    ),
  ],
);

// ═══ 4. rpg_party — party membership + the persistent sheet (XOR characterId/userId) ══════════════════
export const rpgParty = sqliteTable(
  "rpg_party",
  {
    id: text("id").$type<RpgPartyMemberId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    // An AI companion (roster character) — XOR userId.
    characterId: text("character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "cascade" }),
    // A human player's seat — XOR characterId.
    userId: text("user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    sheet: text("sheet", { mode: "json" }).$type<RpgSheet>().notNull(),
    arc: text("arc", { mode: "json" }).$type<RpgPartyArc>(),
    provenance: text("provenance", { enum: RPG_PARTY_PROVENANCES }).notNull(),
    joinedSession: integer("joined_session").notNull(),
    // Leaving is a horizon, not a delete (memory-witnessing analogue).
    leftSession: integer("left_session"),
  },
  (t) => [
    // XOR: exactly one of characterId / userId is set (mirrors chat_participants).
    check("rpg_party_actor_xor_check", sql.raw("(character_id is null) <> (user_id is null)")),
    check(
      "rpg_party_provenance_check",
      sql.raw(`provenance in (${checkList(RPG_PARTY_PROVENANCES)})`),
    ),
    // One seat per actor.
    uniqueIndex("rpg_party_game_character_unique").on(t.gameId, t.characterId),
    uniqueIndex("rpg_party_game_user_unique").on(t.gameId, t.userId),
  ],
);

// ═══ 5. rpg_clocks — progress clocks (Blades sizes; filled BETWEEN 0 AND segments) ════════════════════
export const rpgClocks = sqliteTable(
  "rpg_clocks",
  {
    id: text("id").$type<RpgClockId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    segments: integer("segments").notNull(),
    filled: integer("filled").notNull().default(0),
    kind: text("kind", { enum: RPG_CLOCK_KINDS }).notNull(),
    // Hidden clocks are the GM's hand (P3).
    visibility: text("visibility", { enum: RPG_CLOCK_VISIBILITIES }).notNull().default("visible"),
    // HIDDEN — what fires at full.
    consequence: text("consequence").notNull().default(""),
    status: text("status", { enum: RPG_CLOCK_STATUSES }).notNull().default("active"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check("rpg_clocks_segments_check", sql.raw(`segments in (${CLOCK_SEGMENTS_LIST})`)),
    check("rpg_clocks_filled_check", sql.raw("filled between 0 and segments")),
    check("rpg_clocks_kind_check", sql.raw(`kind in (${checkList(RPG_CLOCK_KINDS)})`)),
    check(
      "rpg_clocks_visibility_check",
      sql.raw(`visibility in (${checkList(RPG_CLOCK_VISIBILITIES)})`),
    ),
    check("rpg_clocks_status_check", sql.raw(`status in (${checkList(RPG_CLOCK_STATUSES)})`)),
  ],
);

// ═══ 6. rpg_journal + rpg_quests ══════════════════════════════════════════════════════════════════════
export const rpgJournal = sqliteTable(
  "rpg_journal",
  {
    id: text("id").$type<RpgJournalId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    type: text("type", { enum: RPG_JOURNAL_TYPES }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceMessageId: text("source_message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [check("rpg_journal_type_check", sql.raw(`type in (${checkList(RPG_JOURNAL_TYPES)})`))],
);

export const rpgQuests = sqliteTable(
  "rpg_quests",
  {
    id: text("id").$type<RpgQuestId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: RPG_QUEST_STATUSES }).notNull().default("active"),
    description: text("description").notNull().default(""),
    objectives: text("objectives", { mode: "json" })
      .$type<readonly RpgQuestObjective[]>()
      .notNull()
      .default(sql`'[]'`),
    // HIDDEN — GM notes.
    gmNotes: text("gm_notes").notNull().default(""),
    discoveredAt: integer("discovered_at").notNull().default(sql`(unixepoch() * 1000)`),
    resolvedAt: integer("resolved_at"),
  },
  () => [check("rpg_quests_status_check", sql.raw(`status in (${checkList(RPG_QUEST_STATUSES)})`))],
);

// ═══ 7. rpg_maps ══════════════════════════════════════════════════════════════════════════════════════
export const rpgMaps = sqliteTable(
  "rpg_maps",
  {
    id: text("id").$type<RpgMapId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: RPG_MAP_KINDS }).notNull(),
    data: text("data", { mode: "json" }).$type<RpgMapData>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [check("rpg_maps_kind_check", sql.raw(`kind in (${checkList(RPG_MAP_KINDS)})`))],
);

// ═══ 8. rpg_hud_widgets — definitions as rows, values as BINDINGS ═════════════════════════════════════
export const rpgHudWidgets = sqliteTable(
  "rpg_hud_widgets",
  {
    id: text("id").$type<RpgWidgetId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    type: text("type", { enum: RPG_WIDGET_TYPES }).notNull(),
    label: text("label").notNull(),
    icon: text("icon"),
    position: text("position", { enum: RPG_WIDGET_POSITIONS }).notNull(),
    accent: text("accent"),
    sort: integer("sort").notNull().default(0),
    binding: text("binding", { mode: "json" }).$type<RpgWidgetBinding>().notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check("rpg_hud_widgets_type_check", sql.raw(`type in (${checkList(RPG_WIDGET_TYPES)})`)),
    check(
      "rpg_hud_widgets_position_check",
      sql.raw(`position in (${checkList(RPG_WIDGET_POSITIONS)})`),
    ),
  ],
);

// ═══ 9. rpg_sessions — the campaign heartbeat ═════════════════════════════════════════════════════════
export const rpgSessions = sqliteTable(
  "rpg_sessions",
  {
    id: text("id").$type<RpgSessionId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    sessionNumber: integer("session_number").notNull(),
    status: text("status", { enum: RPG_SESSION_STATUSES }).notNull().default("active"),
    // Null until concluded.
    summary: text("summary", { mode: "json" }).$type<RpgSessionSummary>(),
    startedAt: integer("started_at").notNull().default(sql`(unixepoch() * 1000)`),
    concludedAt: integer("concluded_at"),
  },
  (t) => [
    uniqueIndex("rpg_sessions_game_number_unique").on(t.gameId, t.sessionNumber),
    check("rpg_sessions_status_check", sql.raw(`status in (${checkList(RPG_SESSION_STATUSES)})`)),
  ],
);

// ═══ 10. rpg_checkpoints — a POINTER to a snapshot (RESTRICT) ═════════════════════════════════════════
export const rpgCheckpoints = sqliteTable(
  "rpg_checkpoints",
  {
    id: text("id").$type<RpgCheckpointId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    // RESTRICT: "restore silently broken because the snapshot got deleted" becomes a constraint error.
    snapshotId: text("snapshot_id")
      .$type<RpgSnapshotId>()
      .notNull()
      .references(() => rpgSnapshots.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    trigger: text("trigger", { enum: RPG_CHECKPOINT_TRIGGERS }).notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check(
      "rpg_checkpoints_trigger_check",
      sql.raw(`trigger in (${checkList(RPG_CHECKPOINT_TRIGGERS)})`),
    ),
  ],
);

// ═══ 10b. rpg_pending_checks — the check request/resolve handshake (one pending per target) ═══════════
export const rpgPendingChecks = sqliteTable(
  "rpg_pending_checks",
  {
    id: text("id").$type<RpgPendingCheckId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    targetPartyMemberId: text("target_party_member_id")
      .$type<RpgPartyMemberId>()
      .notNull()
      .references(() => rpgParty.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    dc: integer("dc").notNull(),
    advantage: integer("advantage", { mode: "boolean" }).notNull().default(false),
    disadvantage: integer("disadvantage", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
    requestedBy: text("requested_by", { enum: RPG_PENDING_CHECK_REQUESTERS }).notNull(),
    status: text("status", { enum: RPG_PENDING_CHECK_STATUSES }).notNull().default("pending"),
    result: text("result", { mode: "json" }).$type<RpgCheckResult>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    check("rpg_pending_checks_dc_check", sql.raw(`dc between ${DC_MIN} and ${DC_MAX}`)),
    check(
      "rpg_pending_checks_requested_by_check",
      sql.raw(`requested_by in (${checkList(RPG_PENDING_CHECK_REQUESTERS)})`),
    ),
    check(
      "rpg_pending_checks_status_check",
      sql.raw(`status in (${checkList(RPG_PENDING_CHECK_STATUSES)})`),
    ),
    // One `pending` row per target (the request/resolve handshake).
    uniqueIndex("rpg_pending_checks_target_pending_unique")
      .on(t.targetPartyMemberId)
      .where(sql`status = 'pending'`),
  ],
);

// ═══ 11. rpg_encounters + rpg_scenes ══════════════════════════════════════════════════════════════════
export const rpgEncounters = sqliteTable(
  "rpg_encounters",
  {
    id: text("id").$type<RpgEncounterId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    status: text("status", { enum: RPG_ENCOUNTER_STATUSES }).notNull().default("active"),
    round: integer("round").notNull().default(0),
    state: text("state", { mode: "json" }).$type<RpgEncounterState>().notNull(),
    startedMessageId: text("started_message_id")
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: "set null" }),
    summary: text("summary", { mode: "json" }).$type<RpgCombatSummary>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    endedAt: integer("ended_at"),
  },
  (t) => [
    check(
      "rpg_encounters_status_check",
      sql.raw(`status in (${checkList(RPG_ENCOUNTER_STATUSES)})`),
    ),
    // One `active` encounter per game (the workloads single-active pattern).
    uniqueIndex("rpg_encounters_game_active_unique").on(t.gameId).where(sql`status = 'active'`),
  ],
);

export const rpgScenes = sqliteTable(
  "rpg_scenes",
  {
    id: text("id").$type<RpgSceneId>().primaryKey(),
    gameId: text("game_id")
      .$type<RpgGameId>()
      .notNull()
      .references(() => rpgGames.id, { onDelete: "cascade" }),
    forkChatId: text("fork_chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    status: text("status", { enum: RPG_SCENE_STATUSES }).notNull().default("active"),
    plan: text("plan", { mode: "json" }).$type<RpgScenePlan>().notNull(),
    summaryText: text("summary_text"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    concludedAt: integer("concluded_at"),
  },
  () => [check("rpg_scenes_status_check", sql.raw(`status in (${checkList(RPG_SCENE_STATUSES)})`))],
);
