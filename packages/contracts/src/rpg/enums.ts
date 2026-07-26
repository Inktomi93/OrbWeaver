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
