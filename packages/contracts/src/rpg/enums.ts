// @orb/contracts/rpg/enums — the string-union tuples (each `as const`, union derived, CHECK-derived in
// `db/schema/rpg.ts`). ONE home per axis (spine §5.5): a new member fails `tsc` at
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

/** Journal entry type — vocabulary WHOLE; lite's model writes any of them (labels, not engines). R4c added
 *  the `custom` ESCAPE (owner go, 2026-07-31): the closed seven were combat-flavoured on a plane that fires on
 *  79% of turns, in the genres lite is best at, and a DB CHECK made them a wall. `custom` mirrors
 *  {@link RPG_RELATIONSHIP_KINDS} exactly — keep the enum (a model can never emit an off-vocab token under an
 *  enforcing grammar) and reach anything else through the entry's free `label` (+ per-game
 *  `features.journalTypeHints` so a host-defined type steers, the R4b gloss argument). */
export const RPG_JOURNAL_TYPES = ["location", "npc", "combat", "quest", "item", "event", "note", "custom"] as const;
export type RpgJournalType = (typeof RPG_JOURNAL_TYPES)[number];
export const rpgJournalTypeSchema = z.enum(RPG_JOURNAL_TYPES);

/** Checkpoint trigger. Lite only ever writes `"manual"`; full ADDS the session/combat arms (additive
 *  tuple members — the reserved-vocabulary posture). */
export const RPG_CHECKPOINT_TRIGGERS = ["manual"] as const;
/** @public twin: RPG_CHECKPOINT_TRIGGERS — the type face of the trigger tuple (cross-package PUBLIC);
 *  covers full's additive session/combat trigger arms, shipped as data ahead of the full-mode graft. */
export type RpgCheckpointTrigger = (typeof RPG_CHECKPOINT_TRIGGERS)[number];
export const rpgCheckpointTriggerSchema = z.enum(RPG_CHECKPOINT_TRIGGERS);

// The TRACKER axes (the tracked-field unification, `docs/design/tracked-field-unification.md` §2). These four
// tuples ARE the unification: pool/meter/cast-field/band-orb/widget were never five concepts, they were one
// def read along these axes. The shapes they replace (`RPG_WIDGET_TYPES`/`RPG_WIDGET_POSITIONS`/
// `RPG_CAST_FIELD_KINDS`) are DELETED outright — no-legacy ruling, no compat vocabulary.

/** A tracker's SHAPE — what kind of datum it holds. `meter` = value/max (the old pools, meter cast-fields,
 *  meter widgets); `text` = a free string chip (the old text cast-fields); `list` = string lines (the old
 *  widget `items[]`). Drives the value union, the panel render, and the delta diff. */
export const RPG_TRACKER_SHAPES = ["meter", "text", "list"] as const;
export type RpgTrackerShape = (typeof RPG_TRACKER_SHAPES)[number];
export const rpgTrackerShapeSchema = z.enum(RPG_TRACKER_SHAPES);

/** A tracker's WRITE axis — the loud distinction the old surfaces buried. `delta` = a RESOURCE the story
 *  spends/restores (the tool arm takes `{key, delta}`); `set` = a STATE the story observes (the arm takes
 *  `{key, value}`). It drives the tool arg shape, the model's mental model, and the panel read (a bar you
 *  drain vs a gauge that tracks). */
export const RPG_TRACKER_WRITES = ["delta", "set"] as const;
/** @public future: the not-yet-built tracker-write consumers — derived from the live `RPG_TRACKER_WRITES`
 *  tuple, which `rpgTrackerWriteSchema` and the tool-arg shape selection read directly; the `delta`/`set`
 *  discrimination surface they key off (rpg/index.ts KISS/YAGNI SUSPENDED). */
export type RpgTrackerWrite = (typeof RPG_TRACKER_WRITES)[number];
export const rpgTrackerWriteSchema = z.enum(RPG_TRACKER_WRITES);

/** A tracker's SUBJECT — `actor` (per-carrier, resolved through `appliesTo`+grants−revokes) or `game` (ONE
 *  value on the snapshot; the old game-scoped widgets, no carrier resolution). */
export const RPG_TRACKER_SUBJECTS = ["actor", "game"] as const;
/** @public future: the not-yet-built full-mode tracker consumers — derived from the live `RPG_TRACKER_SUBJECTS`
 *  tuple, which `rpgTrackerSubjectSchema` and the carrier-resolution code read directly; the full-mode
 *  `game`/`actor`-subject discrimination surface they key off (rpg/index.ts KISS/YAGNI SUSPENDED). */
export type RpgTrackerSubject = (typeof RPG_TRACKER_SUBJECTS)[number];
export const rpgTrackerSubjectSchema = z.enum(RPG_TRACKER_SUBJECTS);

/** The carrier CLASSES an actor-subject tracker's `appliesTo` may name (the alternative is an explicit
 *  `ActorRef[]`). Honest to what the old surfaces were: pool defs were per-party-member (`party`), cast
 *  fields were per-NPC (`npcs`). `everyone` is the column-field arm. */
export const RPG_TRACKER_CARRIER_CLASSES = ["party", "npcs", "everyone"] as const;
export type RpgTrackerCarrierClass = (typeof RPG_TRACKER_CARRIER_CLASSES)[number];
export const rpgTrackerCarrierClassSchema = z.enum(RPG_TRACKER_CARRIER_CLASSES);

/** Relationship kind — the CLOSED genre-floor vocab + an explicit `custom` escape (NOT free
 *  text, NOT a bare closed enum). The five are ordered lover→friend→ally→neutral→enemy (a warmth axis, so a
 *  future gradient render is a SORT not a re-map); `custom` reaches any relationship via a free `label` (+ an
 *  optional per-kind host HINT). A model can NEVER emit an off-vocab kind (the enum binds the token under a
 *  schema-enforcing backend, §2.3) but CAN reach anything through `{kind:"custom", label:"…"}`. */
export const RPG_RELATIONSHIP_KINDS = ["lover", "friend", "ally", "neutral", "enemy", "custom"] as const;
export type RpgRelationshipKind = (typeof RPG_RELATIONSHIP_KINDS)[number];
/** @public twin: RPG_RELATIONSHIP_KINDS — the zod (wire-validation) counterpart of the tuple, which is
 *  cross-package PUBLIC; the wire-validation surface a future relationship-write endpoint uses. */
export const rpgRelationshipKindSchema = z.enum(RPG_RELATIONSHIP_KINDS);

/** P5 — what a CYOA choice CLICK does (§5.4). `compose` = the option text lands in the composer DRAFT + the
 *  composer focuses (the reader appends flavor, then sends) — the default, a lower-commitment interaction;
 *  `send` = the option text fires as the user turn IMMEDIATELY (the classic one-tap CYOA). The render is
 *  toggle-independent — the choice buttons always show (`content-classes` `choices.reading:"show"`); this
 *  knob only shapes the click handler's behavior. */
export const RPG_CYOA_CHOICE_BEHAVIORS = ["compose", "send"] as const;
export type RpgCyoaChoiceBehavior = (typeof RPG_CYOA_CHOICE_BEHAVIORS)[number];
/** @public future: a future CYOA-behavior write path (unbuilt) — the zod counterpart of the live
 *  `RPG_CYOA_CHOICE_BEHAVIORS` tuple, whose current consumers read the tuple/`RpgCyoaChoiceBehavior` type
 *  directly; kept alongside its sibling schemas for that write path's wire validation (rpg/index.ts KISS/YAGNI
 *  SUSPENDED). */
export const rpgCyoaChoiceBehaviorSchema = z.enum(RPG_CYOA_CHOICE_BEHAVIORS);
