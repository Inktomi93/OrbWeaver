// @orb/contracts/rpg/snapshot — the swipe-volatile plane's shapes (rpg-design/05 §2.4-2.5). Quests fold
// INTO the snapshot (a `quests` array — clone-forward like inventory/cast) so mutable quest state is
// swipe-consistent by the same machinery inventory already uses (resolution ladder, staging read-through,
// locks, clone-forward); a quest table would need event-sourcing along the variant chain for per-swipe
// state. Each quest carries a minted stable `id` so a hand edit or tool flip on any swipe addresses the
// same quest; per-quest lock paths (`quests.<id>`) ride the `fieldLocks` grammar.
//
// The journal is NOT here — it is a variant-AWARE TABLE (unbounded archive; snapshot-copying it every
// turn is O(archive)-wrong). See `db/schema/rpg.ts` `rpg_journal` + the lineage projection (§2.5).

import type { RpgQuestId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { rpgActorVolatileSchema } from "./actor";
import { rpgClockTimeSchema, rpgWeatherSchema } from "./ambient";
import { RPG_QUEST_STATUSES, RPG_RELATIONSHIP_KINDS } from "./enums";
import { rpgTrackerValuesSchema } from "./tracker";

/** A present character's RELATIONSHIP (parity-plus §2.1) — a first-class field, NOT a `customFields` entry.
 *  `kind` rides the closed vocab (§2.3 constrains it to the six tokens at the token level); `label` is the free
 *  gloss used ONLY when `kind === "custom"` (empty otherwise). The default reading is the cast member's stance
 *  toward the PLAYER. Swipe-consistent by construction (it rides the `presentCharacters` volatile plane). */
export const rpgRelationshipSchema = z.object({
  kind: z.enum(RPG_RELATIONSHIP_KINDS).default("neutral"),
  label: z.string().default(""),
});
export type RpgRelationship = z.infer<typeof rpgRelationshipSchema>;

// The PLOT plane (parity-plus P5 — the campaign-scale progression datum; workboard ruling #2). SNAPSHOT-
// RESIDENT like quests: clone-forward on every variant, so the acts are swipe-consistent by the same
// machinery (a swipe rewinds the act with everything else). `act` is the 1-based CURRENT act into `acts`;
// `title` is the overall story title; each act carries its own title + a short summary. Model-writable via
// `update_scene.plot` (a compact patch — the applier maintains the acts array so a small model never
// manages a nested list); hand-locked via the `plot` fieldLocks prefix. The panel act rail renders `acts`
// with the current act embered; null = no plot authored yet (the rail renders nothing — no invented acts).

/** One act of the plot spine — a title (the rail's label) + a short optional summary. */
export const rpgPlotActSchema = z.object({
  title: z.string().default(""),
  summary: z.string().default(""),
});
export type RpgPlotAct = z.infer<typeof rpgPlotActSchema>;

/** The snapshot-resident plot object (P5). `act` indexes 1-based into `acts` (the applier keeps
 *  `acts.length >= act`, padding untitled acts, so the rail is total). */
export const rpgPlotSchema = z.object({
  act: z.number().int().min(1).default(1),
  title: z.string().default(""),
  acts: z.array(rpgPlotActSchema).default([]),
});
export type RpgPlot = z.infer<typeof rpgPlotSchema>;

/** A quest objective — a stable-`id` line with a completion flag (`n/m` derives from these). The objective
 *  `id` is a plain in-blob string (`id` doesn't trip `no-raw-id`; a per-objective brand buys nothing at
 *  this cardinality — the objective is addressed only within its quest). */
export const rpgQuestObjectiveSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  completed: z.boolean().default(false),
});
export type RpgQuestObjective = z.infer<typeof rpgQuestObjectiveSchema>;

/** The SNAPSHOT-RESIDENT quest object (§2.5). `id` is a prefix-less branded nanoid (`RpgQuestId`) minted IN
 *  the blob (no table, no FK, no `ID_PREFIX` entry) — the type-safety-without-TypeID middle the spec's
 *  "plain string" call wanted, made a real brand so the id flows typed through the snapshot addressing
 *  (`fieldLocks` path `quests.<id>`, the tool flip target). Identity is stable across variants. */
export const rpgQuestSchema = z.object({
  id: brandedId<RpgQuestId>(),
  name: z.string().min(1),
  status: z.enum(RPG_QUEST_STATUSES),
  description: z.string().default(""),
  objectives: z.array(rpgQuestObjectiveSchema).default([]),
});
export type RpgQuest = z.infer<typeof rpgQuestSchema>;

/** A scene cast member (present character). The `npcId` linkage grafts as an additive optional field
 *  (§4.1). `key` is the stable normalized-name join to a `cast` actor ref. */
export const rpgPresentCharacterSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  characterId: typeIdSchema(ID_PREFIX.character).optional(),
  emoji: z.string().default(""),
  mood: z.string().default(""),
  appearance: z.string().optional(),
  outfit: z.string().optional(),
  thoughts: z.string().optional(),
  relationship: rpgRelationshipSchema.default({ kind: "neutral", label: "" }),
});
export type RpgPresentCharacter = z.infer<typeof rpgPresentCharacterSchema>;

/** The manual-edit-wins lock record — a presence-key set (`Record<path, true>`). Only `editSnapshot`
 *  writes it (auto-locking touched fields); tools HONOR it (the merge drops locked paths); it carries
 *  forward on clone-forward. Per-quest paths are `quests.<id>`. */
export const rpgFieldLocksSchema = z.record(z.string(), z.literal(true));
export type RpgFieldLocks = z.infer<typeof rpgFieldLocksSchema>;

/** The full swipe-volatile snapshot STATE (the `rpg_snapshots` JSON columns, born whole — full grafts
 *  ZERO columns here). This is the shape the staging accumulator overlays and clone-forwards; `quests`
 *  rides INSIDE it (§2.5). The db table splits these into columns; this schema is the composed read shape
 *  the resolution ladder returns. */
export const rpgSnapshotStateSchema = z.object({
  clock: rpgClockTimeSchema.nullable(),
  calendarDate: z.string().nullable(),
  location: z.string().default(""),
  weather: rpgWeatherSchema.nullable(),
  presentCharacters: z.array(rpgPresentCharacterSchema).default([]),
  recentEvents: z.array(z.string()).default([]),
  actorState: z.array(rpgActorVolatileSchema).default([]),
  // The GAME-SUBJECT tracker values (the tracked-field unification §5.2) — one value per `subject:"game"`
  // tracker, keyed by tracker `key`. Replaces `widgetValues`, which keyed by widget LABEL (so a rename
  // orphaned the value) and whose defs lived in a whole separate TABLE. Actor-subject values live on
  // `actorState[].trackerValues` — one shape, two homes by subject, no third.
  trackerValues: rpgTrackerValuesSchema.default({}),
  quests: z.array(rpgQuestSchema).default([]),
  // The P5 plot plane — nullable like clock/weather (null = no plot authored; the rail renders nothing).
  // Defaulted null so a pre-P5 state blob self-heals at the parse seam (the quests `.default` posture).
  plot: rpgPlotSchema.nullable().default(null),
  fieldLocks: rpgFieldLocksSchema.nullable(),
});
export type RpgSnapshotState = z.infer<typeof rpgSnapshotStateSchema>;
