// @orb/contracts/rpg/enums — the string-union tuples (each `as const`, union derived, CHECK-derived in
// `db/schema/rpg.ts`). ONE home per axis: a new member fails `tsc` at
// every mapped-type/`assertNever` consumer; the db column derives its CHECK from the same tuple (no
// re-spell). Several tuples ship VOCABULARY WHOLE that lite doesn't exercise as engines — the labels are
// data the model writes; full's engines key their guards off the same members (deleting + re-adding at
// graft is the exact re-spell the tuple exists to prevent).

import { z } from "zod";

/** The mode axis. `rpg_games.mode` CHECK derives from this; `createGame` mints only `"lite"`
 *  (`"full"` → the typed PHASE refusal). No DB default — a lite-first build defaulting either way plants
 *  a value some later wave must flip, and a default flip IS a re-spell. */
export const RPG_GAME_MODES = ["lite", "full"] as const;
export type RpgGameMode = (typeof RPG_GAME_MODES)[number];
export const rpgGameModeSchema = z.enum(RPG_GAME_MODES) satisfies z.ZodType<RpgGameMode>;

/** Game lifecycle status. Lite mints `"active"`; the other three are full's wizard states, shipped as
 *  vocabulary ahead of the engine that writes them. */
export const RPG_GAME_STATUSES = ["setup", "ready", "active", "concluded"] as const;
export type RpgGameStatus = (typeof RPG_GAME_STATUSES)[number];
export const rpgGameStatusSchema = z.enum(RPG_GAME_STATUSES) satisfies z.ZodType<RpgGameStatus>;

// Quest status — the object lives in the snapshot (`snapshot.ts`).
const RPG_QUEST_STATUSES = ["active", "completed", "failed"] as const;
export type RpgQuestStatus = (typeof RPG_QUEST_STATUSES)[number];
export const rpgQuestStatusSchema = z.enum(RPG_QUEST_STATUSES) satisfies z.ZodType<RpgQuestStatus>;

/** Journal entry type — vocabulary WHOLE; lite's model writes any of them (labels, not engines). A DB CHECK
 *  makes the closed set a wall, so `custom` is the escape: it mirrors {@link RPG_RELATIONSHIP_KINDS} exactly —
 *  a model can never emit an off-vocab token under an enforcing grammar, and reaches anything else through the
 *  entry's free `label` (+ per-game `features.journalTypeHints` so a host-defined type steers). */
export const RPG_JOURNAL_TYPES = ["location", "npc", "combat", "quest", "item", "event", "note", "custom"] as const;
export type RpgJournalType = (typeof RPG_JOURNAL_TYPES)[number];
export const rpgJournalTypeSchema = z.enum(RPG_JOURNAL_TYPES) satisfies z.ZodType<RpgJournalType>;

/** Checkpoint trigger. Lite only ever writes `"manual"`; full ADDS the session/combat arms (additive
 *  tuple members — the reserved-vocabulary posture). */
export const RPG_CHECKPOINT_TRIGGERS = ["manual"] as const;

export type RpgCheckpointTrigger = (typeof RPG_CHECKPOINT_TRIGGERS)[number];
export const rpgCheckpointTriggerSchema = z.enum(RPG_CHECKPOINT_TRIGGERS) satisfies z.ZodType<RpgCheckpointTrigger>;

/** The kinds of `rpg_snapshots` row (D124). A `turn` row is keyed to the variant whose flush wrote it; a `hand`
 *  row is every other state write. Both are beats on the room's state ladder. A `bookmark` row is a checkpoint's
 *  saved state: restore reads it, and the ladder never does. */
export const RPG_SNAPSHOT_KINDS = ["turn", "hand", "bookmark"] as const;
type RpgSnapshotKind = (typeof RPG_SNAPSHOT_KINDS)[number];
export const RPG_SNAPSHOT_KIND = { turn: "turn", hand: "hand", bookmark: "bookmark" } as const satisfies { readonly [K in RpgSnapshotKind]: K };
/** The snapshot kinds a checkpoint may pin: only its own bookmark copy, never a beat. */
export const RPG_CHECKPOINT_SNAPSHOT_KINDS = [RPG_SNAPSHOT_KIND.bookmark] as const;

// The TRACKER axes. These four tuples ARE the design: pool/meter/cast-field/band-orb/widget were never five
// concepts, they are one def read along these axes.

// A tracker's SHAPE — what kind of datum it holds. `meter` = value/max; `text` = a free string chip;
//  `list` = string lines. Drives the value union, the panel render, and the delta diff.
const RPG_TRACKER_SHAPES = ["meter", "text", "list"] as const;
export type RpgTrackerShape = (typeof RPG_TRACKER_SHAPES)[number];
export const rpgTrackerShapeSchema = z.enum(RPG_TRACKER_SHAPES) satisfies z.ZodType<RpgTrackerShape>;

// A tracker's WRITE axis. `delta` = a RESOURCE the story
//  spends/restores (the tool arm takes `{key, delta}`); `set` = a STATE the story observes (the arm takes
//  `{key, value}`). It drives the tool arg shape, the model's mental model, and the panel read (a bar you
//  drain vs a gauge that tracks).
const RPG_TRACKER_WRITES = ["delta", "set"] as const;
export type RpgTrackerWrite = (typeof RPG_TRACKER_WRITES)[number];
export const rpgTrackerWriteSchema = z.enum(RPG_TRACKER_WRITES) satisfies z.ZodType<RpgTrackerWrite>;

// A tracker's SUBJECT — `actor` (per-carrier, resolved through `appliesTo`+grants−revokes) or `game` (ONE
//  value on the snapshot, no carrier resolution).
const RPG_TRACKER_SUBJECTS = ["actor", "game"] as const;
export type RpgTrackerSubject = (typeof RPG_TRACKER_SUBJECTS)[number];
export const rpgTrackerSubjectSchema = z.enum(RPG_TRACKER_SUBJECTS) satisfies z.ZodType<RpgTrackerSubject>;

// The carrier CLASSES an actor-subject tracker's `appliesTo` may name (the alternative is an explicit
//  `ActorRef[]`). `everyone` is the column-field arm.
const RPG_TRACKER_CARRIER_CLASSES = ["party", "npcs", "everyone"] as const;
export type RpgTrackerCarrierClass = (typeof RPG_TRACKER_CARRIER_CLASSES)[number];
export const rpgTrackerCarrierClassSchema = z.enum(RPG_TRACKER_CARRIER_CLASSES) satisfies z.ZodType<RpgTrackerCarrierClass>;

/** Relationship kind — the CLOSED genre-floor vocab + an explicit `custom` escape (NOT free
 *  text, NOT a bare closed enum). The five are ordered lover→friend→ally→neutral→enemy (a warmth axis, so a
 *  future gradient render is a SORT not a re-map); `custom` reaches any relationship via a free `label` (+ an
 *  optional per-kind host HINT). A model can NEVER emit an off-vocab kind (the enum binds the token under a
 *  schema-enforcing backend) but CAN reach anything through `{kind:"custom", label:"…"}`. */
export const RPG_RELATIONSHIP_KINDS = ["lover", "friend", "ally", "neutral", "enemy", "custom"] as const;
export type RpgRelationshipKind = (typeof RPG_RELATIONSHIP_KINDS)[number];
export const rpgRelationshipKindSchema = z.enum(RPG_RELATIONSHIP_KINDS) satisfies z.ZodType<RpgRelationshipKind>;

/** What a CYOA choice CLICK does. `compose` = the option text lands in the composer DRAFT + the
 *  composer focuses (the reader appends flavor, then sends) — the default, a lower-commitment interaction;
 *  `send` = the option text fires as the user turn IMMEDIATELY (the classic one-tap CYOA). The render is
 *  toggle-independent — the choice buttons always show (`content-classes` `choices.reading:"show"`); this
 *  knob only shapes the click handler's behavior. */
export const RPG_CYOA_CHOICE_BEHAVIORS = ["compose", "send"] as const;
export type RpgCyoaChoiceBehavior = (typeof RPG_CYOA_CHOICE_BEHAVIORS)[number];
export const rpgCyoaChoiceBehaviorSchema = z.enum(RPG_CYOA_CHOICE_BEHAVIORS) satisfies z.ZodType<RpgCyoaChoiceBehavior>;
