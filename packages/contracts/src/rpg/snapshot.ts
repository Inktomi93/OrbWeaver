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
import { RPG_QUEST_STATUSES, RPG_WIDGET_POSITIONS, RPG_WIDGET_TYPES } from "./enums";

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
  customFields: z.record(z.string(), z.string()).default({}),
});
export type RpgPresentCharacter = z.infer<typeof rpgPresentCharacterSchema>;

/** A widget binding — what a HUD widget's value plane reads from. `custom` binds to a free meter/value
 *  (`subjectName` nullable — §8 #6); `pool`/`hp` bind to lite-live actor planes. Full ADDS arms if any. */
export const rpgWidgetBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("custom"), subjectName: z.string().nullable() }),
  z.object({ source: z.literal("pool"), actorKey: z.string().min(1), poolName: z.string().min(1) }),
  z.object({ source: z.literal("hp"), actorKey: z.string().min(1) }),
]);
export type RpgWidgetBinding = z.infer<typeof rpgWidgetBindingSchema>;

/** A HUD widget DEFINITION (identity plane — the `rpg_hud_widgets` row shape without the id/gameId FK). */
export const rpgWidgetDefSchema = z.object({
  type: z.enum(RPG_WIDGET_TYPES),
  label: z.string().min(1),
  icon: z.string().nullable(),
  position: z.enum(RPG_WIDGET_POSITIONS),
  accent: z.string().nullable(),
  sort: z.number().int().default(0),
  binding: rpgWidgetBindingSchema,
});
export type RpgWidgetDef = z.infer<typeof rpgWidgetDefSchema>;

/** A widget's swipe-volatile VALUE (the value plane, keyed by widget label in `widgetValues`). */
export const rpgWidgetValueSchema = z.object({
  value: z.number().optional(),
  max: z.number().optional(),
  items: z.array(z.string()).optional(),
});
export type RpgWidgetValue = z.infer<typeof rpgWidgetValueSchema>;

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
  widgetValues: z.record(z.string(), rpgWidgetValueSchema).default({}),
  quests: z.array(rpgQuestSchema).default([]),
  fieldLocks: rpgFieldLocksSchema.nullable(),
});
export type RpgSnapshotState = z.infer<typeof rpgSnapshotStateSchema>;
