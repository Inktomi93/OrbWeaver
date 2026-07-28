// @orb/contracts/rpg/enums — the string-union tuples (each `as const`, union derived, CHECK-derived in
// `db/schema/rpg.ts`, rpg-design/05 §4.1). ONE home per axis (spine §5.5): a new member fails `tsc` at
// every mapped-type/`assertNever` consumer; the db column derives its CHECK from the same tuple (no
// re-spell). Several tuples ship VOCABULARY WHOLE that lite doesn't exercise as engines — the labels are
// data the model writes; full's engines key their guards off the same members (deleting + re-adding at
// graft is the exact re-spell the tuple exists to prevent).

import { z } from "zod";

/** The mode axis (§2.2). `rpg_games.mode` CHECK derives from this; `createGame` mints only `"lite"`
 *  (`"full"` → the typed PHASE refusal). No DB default — a lite-first build defaulting either way plants
 *  a value some later wave must flip, and a default flip IS a re-spell. */
export const RPG_GAME_MODES = ["lite", "full"] as const;
export type RpgGameMode = (typeof RPG_GAME_MODES)[number];
export const rpgGameModeSchema = z.enum(RPG_GAME_MODES);

/** Game lifecycle status. Lite mints `"active"`; the other three are full's wizard states, shipped as
 *  vocabulary (they go LIVE at graft — already shipped, §C). */
export const RPG_GAME_STATUSES = ["setup", "ready", "active", "concluded"] as const;
export type RpgGameStatus = (typeof RPG_GAME_STATUSES)[number];
export const rpgGameStatusSchema = z.enum(RPG_GAME_STATUSES);

/** Quest status (§2.5 — the snapshot-resident quest object). */
export const RPG_QUEST_STATUSES = ["active", "completed", "failed"] as const;
export type RpgQuestStatus = (typeof RPG_QUEST_STATUSES)[number];
export const rpgQuestStatusSchema = z.enum(RPG_QUEST_STATUSES);

/** Journal entry type — vocabulary WHOLE; lite's model writes any of them (labels, not engines). */
export const RPG_JOURNAL_TYPES = ["location", "npc", "combat", "quest", "item", "event", "note"] as const;
export type RpgJournalType = (typeof RPG_JOURNAL_TYPES)[number];
export const rpgJournalTypeSchema = z.enum(RPG_JOURNAL_TYPES);

/** Checkpoint trigger. Lite only ever writes `"manual"`; full ADDS the session/combat arms (additive
 *  tuple members — the reserved-vocabulary posture). */
export const RPG_CHECKPOINT_TRIGGERS = ["manual"] as const;
export type RpgCheckpointTrigger = (typeof RPG_CHECKPOINT_TRIGGERS)[number];
export const rpgCheckpointTriggerSchema = z.enum(RPG_CHECKPOINT_TRIGGERS);

/** HUD widget display type — legacy vocabulary adopted whole (display metadata). */
export const RPG_WIDGET_TYPES = ["meter", "counter", "gauge", "badge", "text"] as const;
export type RpgWidgetType = (typeof RPG_WIDGET_TYPES)[number];
export const rpgWidgetTypeSchema = z.enum(RPG_WIDGET_TYPES);

/** HUD widget placement — legacy vocabulary adopted whole. */
export const RPG_WIDGET_POSITIONS = ["banner", "sidebar", "footer"] as const;
export type RpgWidgetPosition = (typeof RPG_WIDGET_POSITIONS)[number];
export const rpgWidgetPositionSchema = z.enum(RPG_WIDGET_POSITIONS);

/** Relationship kind (parity-plus §2.1) — the CLOSED genre-floor vocab + an explicit `custom` escape (NOT free
 *  text, NOT a bare closed enum). The five are ordered lover→friend→ally→neutral→enemy (a warmth axis, so a
 *  future gradient render is a SORT not a re-map); `custom` reaches any relationship via a free `label` (+ an
 *  optional per-kind host HINT, M1). A model can NEVER emit an off-vocab kind (the enum binds the token under a
 *  schema-enforcing backend, §2.3) but CAN reach anything through `{kind:"custom", label:"…"}`. */
export const RPG_RELATIONSHIP_KINDS = ["lover", "friend", "ally", "neutral", "enemy", "custom"] as const;
export type RpgRelationshipKind = (typeof RPG_RELATIONSHIP_KINDS)[number];
export const rpgRelationshipKindSchema = z.enum(RPG_RELATIONSHIP_KINDS);

/** Custom tracked cast-field kind (parity-plus §2.8) — `text` = a free string chip; `meter` = a 0-max numeric
 *  the panel renders as a `TrackBar` and the delta diffs numerically. The host defines the field SCHEMA per
 *  game (`config.features.castFields`); the model writes DEFINED field keys only (enum-constrained, §2.3). */
export const RPG_CAST_FIELD_KINDS = ["text", "meter"] as const;
export type RpgCastFieldKind = (typeof RPG_CAST_FIELD_KINDS)[number];
export const rpgCastFieldKindSchema = z.enum(RPG_CAST_FIELD_KINDS);
