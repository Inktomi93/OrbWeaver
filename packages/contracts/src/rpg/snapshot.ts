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
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import type { RpgActorRef } from "./actor.ts";
import { actorRefKey, rpgActorEntrySchema } from "./actor.ts";
import { rpgClockTimeSchema, rpgWeatherSchema } from "./ambient.ts";
import { RPG_QUEST_STATUSES } from "./enums.ts";
import { rpgTrackerValuesSchema } from "./tracker.ts";

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
  // THE PRESENCE PLANE (R2) — who stands in the scene RIGHT NOW, as `actorRefKey` strings (roster refs
  // included: a roster character on stage is `character:<id>`). Nothing else lives here any more. It used to
  // carry the cast NPC's whole identity row, which made departure a DESTRUCTION of her name, mood,
  // relationship and standing guides while her tracked state survived invisibly on `actorState` — one person,
  // two planes, opposite lifecycles (the review's MS-2). Identity now rides the actor row; presence is a flag
  // over it, so departure retains everything and return re-surfaces the whole NPC.
  presentCharacters: z.array(z.string().min(1)).default([]),
  recentEvents: z.array(z.string()).default([]),
  actorState: z.array(rpgActorEntrySchema).default([]),
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

/** THE HAND-PATCH VOCABULARY — the top-level keys an `editSnapshot` patch may address, DERIVED from the state
 *  schema's own shape (never a hand-spelled second list: a new plane is patchable the day it is declared
 *  above). The verb rejects any other key as errors-as-data instead of merging it into a plain object that the
 *  column projection then drops on the floor — the silent-no-op class this exists to kill (a `{ambient: null}`
 *  patch, addressing the TRACKER VIEW's `ambient` grouping, which is a projection of
 *  `location`/`calendarDate`/`clock`/`weather` and has no state home of its own, wrote nothing, said nothing,
 *  and stamped a junk `ambient` lock).
 *
 *  `fieldLocks` is deliberately EXCLUDED: a lock is snapshot METADATA written through the verb's
 *  `lockPaths`/`releaseLocks` DELTA, never a [merge-clear] state leaf (`inputs.ts`, the `editSnapshot` input
 *  header). The `satisfies` pins the exclusion to a real key — a rename fails `tsc` here. */
export const RPG_SNAPSHOT_STATE_PLANES: ReadonlySet<string> = new Set(
  Object.keys(rpgSnapshotStateSchema.shape).filter((key) => key !== ("fieldLocks" satisfies keyof RpgSnapshotState)),
);

/** THE OP-SHAPED PLANES — state planes that LEFT the `editSnapshot` image vocabulary (R1, the actor-state
 *  review §5): `actorState` is authored per-FIELD through `rpg.patchActor` and removed through
 *  `rpg.dismissActor`. An image over this plane is unauthorable by construction — the client sees it only in
 *  projections (roster half + `castVolatile`, never the offstage rows), so every image it could build was
 *  partial, and the additive merge policy was the only thing standing between a hand click and data loss.
 *  `editSnapshot` refuses these keys as DATA, naming the verb that owns them. */
export const RPG_OP_SHAPED_PLANES: ReadonlySet<string> = new Set<string>(["actorState" satisfies keyof RpgSnapshotState]);

/** The planes an `editSnapshot` patch may still address — the state planes MINUS the op-shaped ones. Derived,
 *  so a plane that grows a verb door leaves this set by editing ONE line above. */
export const RPG_HAND_PATCH_PLANES: ReadonlySet<string> = new Set([...RPG_SNAPSHOT_STATE_PLANES].filter((key) => !RPG_OP_SHAPED_PLANES.has(key)));

/** The lock-path base for one actor's whole ROW — `actorState.<actorRefKey>`. A lock here (or any prefix of a
 *  path under it) pins the element against the model's merge; `dismissActor` clears everything at or below it.
 *  The plane segment is pinned to the state key by `satisfies`. */
export function rpgActorLockBase(ref: RpgActorRef): string {
  return `${"actorState" satisfies keyof RpgSnapshotState}.${actorRefKey(ref)}`;
}

/** The #10 per-field lock-path BASE for one actor's VOLATILE half — `actorState.<actorRefKey>.volatile`. The
 *  fine paths append the op's field (`.status`, `.trackerValues.<key>`, `.wallet.<name>`, …). ONE home for a
 *  grammar with two readers: the server stamps these paths (the `patchActor` auto-lock) and the panel reads
 *  them back to render the pin + its Release. It is a REAL path segment, not a naming choice — the merge walks
 *  the stored JSON, so a lock that skipped `volatile` would bite nothing (R2 moved the fields under it). */
export function rpgActorVolatileLockBase(ref: RpgActorRef): string {
  return `${rpgActorLockBase(ref)}.volatile`;
}

/** The lock-path base for a cast actor's IDENTITY half — `actorState.<actorRefKey>.identity`. The Scene tab's
 *  hand edits (mood · relationship · the standing guides) stamp fine paths under it, exactly as the volatile
 *  edits do under their own base: before R2 those fields lived on `presentCharacters` and could only be pinned
 *  plane-wide, so pinning one NPC's mood froze the whole cast. */
export function rpgActorIdentityLockBase(ref: RpgActorRef): string {
  return `${rpgActorLockBase(ref)}.identity`;
}
