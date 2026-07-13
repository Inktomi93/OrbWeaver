// `@orb/contracts/rpg` — the MINIMAL contract surface the 14 rpg tables' DDL requires. Only the enum
// tuples the column CHECKs derive and the `$type<>` JSON-column schemas the tables reference — no
// service contracts, no verb param/view types. Where a JSON column's shape isn't pinned yet, a
// documented CONSERVATIVE schema is used (a permissive typed blob, never an invented structure).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── String-length / numeric bound constants (noMagicNumbers) ─────────────────────────────────────────
const SETTING_MAX = 2000;
const GOALS_MAX = 2000;
const PREFS_MAX = 4000;
const PROMPT_INSTRUCTIONS_MAX = 1200;
const GENRES_MAX = 4;
const TONES_MAX = 3;
const CRIT_MIN = 19;
const CRIT_MAX = 20;
const ATTR_MIN = 1;
const ATTR_MAX = 30;
const SKILL_MIN = -5;
const SKILL_MAX = 15;
const SPEED_DEFAULT = 10;
const ATTACK_DEFAULT = 5;
const DEFENSE_DEFAULT = 5;
const GRID_MIN = 2;
const GRID_MAX = 12;
const PERCENT_MAX = 100;
const HOUR_MAX = 23;
const MINUTE_MAX = 59;

// ── Enum axes (each derives a db column CHECK / drizzle {enum}) ───────────────────────────────────────

/** rpg_games.status — `setup → ready → active → concluded` (all 4 states modeled; 03 §1). */
export const RPG_GAME_STATUSES = ["setup", "ready", "active", "concluded"] as const;
export const rpgGameStatusSchema = z.enum(RPG_GAME_STATUSES);
export type RpgGameStatus = z.infer<typeof rpgGameStatusSchema>;

/** rpg_games.activeState — gates prompt flavor + encounter/perception behavior (03 §1). */
export const RPG_ACTIVE_STATES = ["exploration", "dialogue", "combat", "travel_rest"] as const;
export const rpgActiveStateSchema = z.enum(RPG_ACTIVE_STATES);
export type RpgActiveState = z.infer<typeof rpgActiveStateSchema>;

/** Setup-wizard difficulty (config, 03 §1.1). */
export const RPG_DIFFICULTIES = ["casual", "normal", "hard", "brutal"] as const;
export const rpgDifficultySchema = z.enum(RPG_DIFFICULTIES);
export type RpgDifficulty = z.infer<typeof rpgDifficultySchema>;

/** Elemental-reaction presets (houseRules.elementPreset; 04 §12). */
export const RPG_ELEMENT_PRESETS = ["default", "genshin", "hsr"] as const;
export const rpgElementPresetSchema = z.enum(RPG_ELEMENT_PRESETS);
export type RpgElementPreset = z.infer<typeof rpgElementPresetSchema>;

/** rpg_hud_widgets.type — the 8 widget kinds (03 §8). */
export const RPG_WIDGET_TYPES = [
  "progress_bar",
  "gauge",
  "relationship_meter",
  "counter",
  "stat_block",
  "list",
  "inventory_grid",
  "timer",
] as const;
export const rpgWidgetTypeSchema = z.enum(RPG_WIDGET_TYPES);
export type RpgWidgetType = z.infer<typeof rpgWidgetTypeSchema>;

/** rpg_hud_widgets.position — which HUD rail the widget renders in (03 §8). */
export const RPG_WIDGET_POSITIONS = ["hud_left", "hud_right"] as const;
export const rpgWidgetPositionSchema = z.enum(RPG_WIDGET_POSITIONS);
export type RpgWidgetPosition = z.infer<typeof rpgWidgetPositionSchema>;

/** rpg_npcs.descriptionSource — provenance (03 §3). */
export const RPG_NPC_DESCRIPTION_SOURCES = ["model", "library", "narration", "user"] as const;
export const rpgNpcDescriptionSourceSchema = z.enum(RPG_NPC_DESCRIPTION_SOURCES);
export type RpgNpcDescriptionSource = z.infer<typeof rpgNpcDescriptionSourceSchema>;

/** rpg_journal.type (03 §6). */
export const RPG_JOURNAL_TYPES = [
  "location",
  "npc",
  "combat",
  "quest",
  "item",
  "event",
  "note",
] as const;
export const rpgJournalTypeSchema = z.enum(RPG_JOURNAL_TYPES);
export type RpgJournalType = z.infer<typeof rpgJournalTypeSchema>;

/** rpg_quests.status (03 §6). */
export const RPG_QUEST_STATUSES = ["active", "completed", "failed"] as const;
export const rpgQuestStatusSchema = z.enum(RPG_QUEST_STATUSES);
export type RpgQuestStatus = z.infer<typeof rpgQuestStatusSchema>;

/** rpg_clocks.segments — the Blades sizes (03 §5; a NUMERIC CHECK, not a string enum). The members are
 *  domain data (the valid clock sizes), not tunable magic numbers. */
// biome-ignore lint/style/noMagicNumbers: the Blades clock sizes are the domain data this tuple names.
export const RPG_CLOCK_SEGMENTS = [4, 6, 8, 12] as const;

/** rpg_clocks.kind (03 §5). */
export const RPG_CLOCK_KINDS = ["front", "project", "countdown"] as const;
export const rpgClockKindSchema = z.enum(RPG_CLOCK_KINDS);
export type RpgClockKind = z.infer<typeof rpgClockKindSchema>;

/** rpg_clocks.visibility (03 §5). */
export const RPG_CLOCK_VISIBILITIES = ["visible", "hidden"] as const;
export const rpgClockVisibilitySchema = z.enum(RPG_CLOCK_VISIBILITIES);
export type RpgClockVisibility = z.infer<typeof rpgClockVisibilitySchema>;

/** rpg_clocks.status (03 §5). */
export const RPG_CLOCK_STATUSES = ["active", "completed", "abandoned"] as const;
export const rpgClockStatusSchema = z.enum(RPG_CLOCK_STATUSES);
export type RpgClockStatus = z.infer<typeof rpgClockStatusSchema>;

/** rpg_maps.kind (03 §7). */
export const RPG_MAP_KINDS = ["grid", "node"] as const;
export const rpgMapKindSchema = z.enum(RPG_MAP_KINDS);
export type RpgMapKind = z.infer<typeof rpgMapKindSchema>;

/** rpg_party.provenance (03 §4). */
export const RPG_PARTY_PROVENANCES = ["setup", "recruited", "joined"] as const;
export const rpgPartyProvenanceSchema = z.enum(RPG_PARTY_PROVENANCES);
export type RpgPartyProvenance = z.infer<typeof rpgPartyProvenanceSchema>;

/** rpg_sessions.status (03 §9). */
export const RPG_SESSION_STATUSES = ["active", "concluding", "concluded"] as const;
export const rpgSessionStatusSchema = z.enum(RPG_SESSION_STATUSES);
export type RpgSessionStatus = z.infer<typeof rpgSessionStatusSchema>;

/** rpg_checkpoints.trigger (03 §10). */
export const RPG_CHECKPOINT_TRIGGERS = [
  "manual",
  "session_start",
  "session_end",
  "combat_start",
  "combat_end",
] as const;
export const rpgCheckpointTriggerSchema = z.enum(RPG_CHECKPOINT_TRIGGERS);
export type RpgCheckpointTrigger = z.infer<typeof rpgCheckpointTriggerSchema>;

/** rpg_pending_checks.requestedBy (03 §10b). */
export const RPG_PENDING_CHECK_REQUESTERS = ["gm-seat", "gm-model"] as const;
export const rpgPendingCheckRequesterSchema = z.enum(RPG_PENDING_CHECK_REQUESTERS);
export type RpgPendingCheckRequester = z.infer<typeof rpgPendingCheckRequesterSchema>;

/** rpg_pending_checks.status (03 §10b). */
export const RPG_PENDING_CHECK_STATUSES = ["pending", "resolved", "declined", "expired"] as const;
export const rpgPendingCheckStatusSchema = z.enum(RPG_PENDING_CHECK_STATUSES);
export type RpgPendingCheckStatus = z.infer<typeof rpgPendingCheckStatusSchema>;

/** rpg_encounters.status (03 §11). */
export const RPG_ENCOUNTER_STATUSES = ["active", "victory", "defeat", "fled", "abandoned"] as const;
export const rpgEncounterStatusSchema = z.enum(RPG_ENCOUNTER_STATUSES);
export type RpgEncounterStatus = z.infer<typeof rpgEncounterStatusSchema>;

/** rpg_scenes.status (03 §11). */
export const RPG_SCENE_STATUSES = ["active", "concluded", "abandoned"] as const;
export const rpgSceneStatusSchema = z.enum(RPG_SCENE_STATUSES);
export type RpgSceneStatus = z.infer<typeof rpgSceneStatusSchema>;

// ── Branded-id sub-schemas (the REAL ID_PREFIX values; 03's inline "char"/"wibook" are shorthand) ────
const characterIdSchema = typeIdSchema(ID_PREFIX.character);
const npcIdSchema = typeIdSchema(ID_PREFIX.rpgNpc);
const partyMemberIdSchema = typeIdSchema(ID_PREFIX.rpgPartyMember);
const clockIdSchema = typeIdSchema(ID_PREFIX.rpgClock);
const worldBookIdSchema = typeIdSchema(ID_PREFIX.worldBook);
const widgetIdSchema = typeIdSchema(ID_PREFIX.rpgWidget);
const styleProfileIdSchema = typeIdSchema(ID_PREFIX.styleProfile);

// ── rpg_games.config — the setup-wizard product (03 §1.1, verbatim) ──────────────────────────────────

export const rpgGameConfigSchema = z.object({
  genres: z.array(z.string().min(1)).min(1).max(GENRES_MAX),
  setting: z.string().max(SETTING_MAX).default("A fantasy world"),
  tones: z.array(z.string().min(1)).min(1).max(TONES_MAX),
  difficulty: rpgDifficultySchema,
  rating: z.enum(["sfw", "nsfw"]),
  language: z.string().default("English"),
  playerGoals: z.string().max(GOALS_MAX).default("Have an adventure"),
  additionalPreferences: z.string().max(PREFS_MAX).default(""),
  gm: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("standalone") }),
    z.object({ kind: z.literal("character"), characterId: characterIdSchema }),
  ]),
  houseRules: z
    .object({
      failForward: z.boolean().default(true),
      criticalRange: z.number().int().min(CRIT_MIN).max(CRIT_MAX).default(CRIT_MAX),
      deathRule: z.enum(["defeat-only", "character-death"]).default("defeat-only"),
      elementPreset: rpgElementPresetSchema.nullable().default(null),
      playerRollsOwnChecks: z.boolean().default(false),
    })
    // `.prefault({})` (not `.default({})`): zod-4 PARSES `{}` so every inner `.default()` applies (the
    // crew/settings section-object precedent).
    .prefault({}),
  assist: z
    .object({
      npcActors: z.boolean().default(false),
      recapOnSessionStart: z.boolean().default(true),
      lorebookUpkeep: z.boolean().default(false),
    })
    .prefault({}),
  imagery: z
    .object({
      enabled: z.boolean().default(false),
      autoIllustrations: z.boolean().default(true),
      useAvatarReferences: z.boolean().default(true),
      includeCharacterAppearance: z.boolean().default(true),
      promptInstructions: z.string().max(PROMPT_INSTRUCTIONS_MAX).default(""),
      // Branded (owner 2026-07-09, no unbranded id strings): 03 §1.1 typed this `z.string()` — a design
      // gap. `StyleProfileId` was minted in @orb/kit/ids; the imagery style-profile entity adopts it later.
      styleProfileId: styleProfileIdSchema.nullable().default(null),
    })
    .prefault({}),
  lorebook: z
    .object({
      keeperEnabled: z.boolean().default(false),
      keeperBookId: worldBookIdSchema.nullable().default(null),
    })
    .prefault({}),
});
export type RpgGameConfig = z.infer<typeof rpgGameConfigSchema>;

// ── rpg_games.lootTable (CONSERVATIVE — 03 defers the shape to 04 §5; a permissive typed blob) ───────
/** Campaign-authored item tables (03 §1: `RpgLootTable`, nullable; 04 §5 owns the verbatim shape).
 *  CONSERVATIVE: a keyed set of weighted item entries; R6/R8-proper replaces it with the 04 §5 letter. */
export const rpgLootTableSchema = z.record(z.string(), z.unknown());
export type RpgLootTable = z.infer<typeof rpgLootTableSchema>;

// ── rpg_snapshots sub-schemas (03 §2) ────────────────────────────────────────────────────────────────

/** `{day≥1, hour 0-23, minute 0-59}` (03 §2 / 04 §8). */
export const rpgClockTimeSchema = z.object({
  day: z.number().int().min(1),
  hour: z.number().int().min(0).max(HOUR_MAX),
  minute: z.number().int().min(0).max(MINUTE_MAX),
});
export type RpgClockTime = z.infer<typeof rpgClockTimeSchema>;

/** `{type, temperatureC, description, wind, visibility}` (03 §2 / 04 §9). */
export const rpgWeatherSchema = z.object({
  type: z.string(),
  temperatureC: z.number(),
  description: z.string(),
  wind: z.string(),
  visibility: z.string(),
});
export type RpgWeather = z.infer<typeof rpgWeatherSchema>;

/** A present actor in the scene tracker (03 §2.1, verbatim; characterId XOR npcId). */
export const rpgPresentCharacterSchema = z
  .object({
    key: z.string().min(1),
    characterId: characterIdSchema.nullable(),
    npcId: npcIdSchema.nullable(),
    name: z.string().min(1),
    emoji: z.string().default("🧑"),
    mood: z.string().default(""),
    appearance: z.string().nullable().default(null),
    outfit: z.string().nullable().default(null),
    thoughts: z.string().nullable().default(null),
    customFields: z.record(z.string(), z.string()).default({}),
  })
  .refine((c) => !(c.characterId && c.npcId), "characterId XOR npcId");
export type RpgPresentCharacter = z.infer<typeof rpgPresentCharacterSchema>;

/** The swipe-keyed volatile per-member state (03 §2.2, verbatim). */
export const rpgPartyVolatileSchema = z.object({
  partyMemberId: partyMemberIdSchema,
  hp: z.object({ value: z.number().int(), max: z.number().int().min(1) }),
  pools: z
    .array(z.object({ name: z.string(), value: z.number().int(), max: z.number().int().min(1) }))
    .default([]),
  conditions: z
    .array(
      z.object({
        name: z.string(),
        stat: z.enum(["attack", "defense", "speed", "hp"]).nullable(),
        modifier: z.number().int(),
        turnsLeft: z.number().int().min(1).nullable(),
      }),
    )
    .default([]),
  inventory: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().default(""),
        quantity: z.number().int().min(0),
        location: z.string().default("on_person"),
      }),
    )
    .default([]),
  status: z.string().default(""),
});
export type RpgPartyVolatile = z.infer<typeof rpgPartyVolatileSchema>;

/** rpg_snapshots.widgetValues value (CONSERVATIVE — only `source:"custom"` widgets have model-writable
 *  values; 03 §8 + 11-ui §94 sketch `{value, max?, tier?, milestones?, dangerBelow?, items?}`). R3/R8
 *  proper tightens it; here it is a permissive typed blob keyed by the widget id. */
export const rpgWidgetValueSchema = z.object({
  value: z.number().optional(),
  max: z.number().optional(),
  tier: z.number().optional(),
  milestones: z.array(z.number()).optional(),
  dangerBelow: z.number().optional(),
  items: z.array(z.string()).optional(),
});
export type RpgWidgetValue = z.infer<typeof rpgWidgetValueSchema>;

/** rpg_snapshots.widgetValues — `Record<RpgWidgetId, RpgWidgetValue>` (03 §2). */
export const rpgWidgetValuesSchema = z.record(widgetIdSchema, rpgWidgetValueSchema);
export type RpgWidgetValues = z.infer<typeof rpgWidgetValuesSchema>;

/** rpg_snapshots.fieldLocks — `Record<string, true>` (presence-only lock keys; 03 §2.3). */
export const rpgFieldLocksSchema = z.record(z.string(), z.literal(true));
export type RpgFieldLocks = z.infer<typeof rpgFieldLocksSchema>;

// ── rpg_party sub-schemas (03 §4) ────────────────────────────────────────────────────────────────────

const attr = z.number().int().min(ATTR_MIN).max(ATTR_MAX);

/** The persistent character sheet, instanced at setup (03 §4.1, verbatim). */
export const rpgSheetSchema = z.object({
  className: z.string().default("Adventurer"),
  shortDescription: z.string().default(""),
  attributes: z.object({ str: attr, dex: attr, con: attr, int: attr, wis: attr, cha: attr }),
  skills: z.record(z.string(), z.number().int().min(SKILL_MIN).max(SKILL_MAX)).default({}),
  abilities: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  maxHp: z.number().int().min(1),
  poolDefs: z.array(z.object({ name: z.string(), max: z.number().int().min(1) })).default([]),
  speed: z.number().int().min(0).default(SPEED_DEFAULT),
  attack: z.number().int().min(0).default(ATTACK_DEFAULT),
  defense: z.number().int().min(0).default(DEFENSE_DEFAULT),
});
export type RpgSheet = z.infer<typeof rpgSheetSchema>;

/** rpg_party.arc — the personal quest hook (03 §4). */
export const rpgPartyArcSchema = z.object({
  name: z.string(),
  arc: z.string(),
  goal: z.string(),
  completed: z.boolean().optional(),
  resolution: z.string().optional(),
});
export type RpgPartyArc = z.infer<typeof rpgPartyArcSchema>;

// ── rpg_quests.objectives (03 §6) ────────────────────────────────────────────────────────────────────

export const rpgQuestObjectiveSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});
export type RpgQuestObjective = z.infer<typeof rpgQuestObjectiveSchema>;

// ── rpg_maps.data (03 §7, verbatim discriminated union) ──────────────────────────────────────────────

export const rpgMapDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("grid"),
    width: z.number().int().min(GRID_MIN).max(GRID_MAX),
    height: z.number().int().min(GRID_MIN).max(GRID_MAX),
    cells: z.array(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        emoji: z.string(),
        label: z.string(),
        terrain: z.string().default(""),
        revealed: z.boolean().default(false),
      }),
    ),
    partyPosition: z.object({ x: z.number().int(), y: z.number().int() }),
  }),
  z.object({
    kind: z.literal("node"),
    nodes: z.array(
      z.object({
        id: z.string(),
        emoji: z.string(),
        label: z.string(),
        x: z.number().min(0).max(PERCENT_MAX),
        y: z.number().min(0).max(PERCENT_MAX),
        revealed: z.boolean().default(false),
      }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
    partyPosition: z.string(),
  }),
]);
export type RpgMapData = z.infer<typeof rpgMapDataSchema>;

// ── rpg_hud_widgets.binding (03 §8, verbatim) ────────────────────────────────────────────────────────

/** CONSERVATIVE (03 §8 sketches `value/max/milestones/dangerBelow/items…`; 11-ui §94 is the fuller
 *  letter). R3-proper tightens it. */
export const rpgCustomWidgetConfigSchema = z.object({
  value: z.number().optional(),
  max: z.number().optional(),
  milestones: z.array(z.number()).optional(),
  dangerBelow: z.number().optional(),
  items: z.array(z.string()).optional(),
});
export type RpgCustomWidgetConfig = z.infer<typeof rpgCustomWidgetConfigSchema>;

export const rpgWidgetBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("party-hp"), partyMemberId: partyMemberIdSchema }),
  z.object({ source: z.literal("pool"), partyMemberId: partyMemberIdSchema, pool: z.string() }),
  z.object({ source: z.literal("clock"), clockId: clockIdSchema }),
  z.object({ source: z.literal("reputation"), npcId: npcIdSchema }),
  z.object({ source: z.literal("morale") }),
  z.object({ source: z.literal("time") }),
  z.object({ source: z.literal("weather") }),
  z.object({ source: z.literal("custom"), config: rpgCustomWidgetConfigSchema }),
]);
export type RpgWidgetBinding = z.infer<typeof rpgWidgetBindingSchema>;

// ── rpg_sessions.summary (03 §9, verbatim) ───────────────────────────────────────────────────────────

export const rpgSessionSummarySchema = z.object({
  summary: z.string(),
  resumePoint: z.string(),
  partyDynamics: z.string().default(""),
  partyState: z.string().default(""),
  keyDiscoveries: z.array(z.string()).default([]),
  characterMoments: z.array(z.string()).default([]),
  littleDetails: z.array(z.string()).default([]),
  npcUpdates: z.array(z.object({ name: z.string(), update: z.string() })).default([]),
  nextSessionRequest: z.string().nullable().default(null),
});
export type RpgSessionSummary = z.infer<typeof rpgSessionSummarySchema>;

// ── rpg_pending_checks.result (CONSERVATIVE — 04 §2 owns the verbatim RpgCheckResult) ────────────────
/** The check outcome `{band, rolls, usedRoll, modifier, total, dc, consequence, timeCost}` (04 §2.2–2.3).
 *  CONSERVATIVE: the band + numbers are pinned; `consequence` is left as a permissive typed blob until
 *  04-proper lands the `consequence.ts` union. */
export const rpgCheckResultSchema = z.object({
  band: z.enum(["critical_success", "success", "partial", "failure", "fumble"]),
  rolls: z.array(z.number().int()),
  usedRoll: z.number().int(),
  modifier: z.number().int(),
  total: z.number().int(),
  dc: z.number().int(),
  consequence: z.record(z.string(), z.unknown()).nullable(),
  timeCost: z.number().int(),
});
export type RpgCheckResult = z.infer<typeof rpgCheckResultSchema>;

// ── rpg_encounters.state / .summary (CONSERVATIVE — 07/R8 own the full shapes) ───────────────────────
/** The live combat state — `combatants/initiative/cooldowns/mechanics/log` (07 §2). CONSERVATIVE: R8
 *  (the encounter engine) lands the full zod; the column exists now as a typed blob (03 rides the
 *  baseline, R8 fills the body). */
export const rpgEncounterStateSchema = z.record(z.string(), z.unknown());
export type RpgEncounterState = z.infer<typeof rpgEncounterStateSchema>;

/** The post-combat summary (07). CONSERVATIVE: R8 lands the full shape. */
export const rpgCombatSummarySchema = z.record(z.string(), z.unknown());
export type RpgCombatSummary = z.infer<typeof rpgCombatSummarySchema>;

// ── rpg_scenes.plan (03 §11, verbatim) ───────────────────────────────────────────────────────────────

export const rpgScenePlanSchema = z.object({
  name: z.string(),
  description: z.string(),
  scenario: z.string(), // HIDDEN (GM-eyes; the member view strips it — R3 projection)
  firstMessage: z.string(),
  participationGuide: z.string(),
  characterIds: z.array(characterIdSchema),
  rating: z.enum(["sfw", "nsfw"]),
});
export type RpgScenePlan = z.infer<typeof rpgScenePlanSchema>;
