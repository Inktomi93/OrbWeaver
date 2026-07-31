// @orb/contracts/rpg/sheet — the per-actor IDENTITY sheet (rpg-design/05 §4.3). `attributes` is a record
// over the profile's attribute vocabulary; a sheet read treats a MISSING key as absent (lite renders
// nothing; full backfills at `center` when ITS seeding lands — the mutability rule, §2.3). Sheets live in
// `rpg_sheets` (the no-party-system ruling: NOT a membership shadow — keyed by durable actor identity,
// projected roster ∪ rows at read time, created on first write). Full grafts `arc` as an ADD COLUMN.
//
// TRACKER DEFS DO NOT LIVE HERE (the tracked-field unification): the old `poolDefs` made the same concept
// per-ACTOR here and per-GAME in `config.features.castFields`, which is exactly what forced the three-tab
// define/value/pin dance. Defs now home ONCE in `config.trackers[]`; what the sheet keeps is the per-actor
// EXCEPTION pair — this actor's grants and revokes against the def-level carrier classes.

import { z } from "zod";

/** The per-actor character sheet — identity-plane data. `attributes` keys off the game's `statProfile`
 *  vocabulary (an int per attribute); `maxHp` is the lite-live mechanical dial the volatile plane's hp tracks
 *  against. `className` is flavor prose. Full ADDS skills/abilities/strengths/weaknesses/attack/defense/speed
 *  as parse-seam-healed JSON fields (§C — no DDL). */
export const rpgSheetSchema = z.object({
  className: z.string().default(""),
  attributes: z.record(z.string(), z.number().int()).default({}),
  maxHp: z.number().int().min(1).nullable(),
  flavor: z.string().default(""),
  // `level` (parity-plus §2.6) — a HAND-ONLY progression dial the host/player owns. Born null (nullable-honesty:
  // the panel renders nothing, never a phantom "Level 0"). It is IDENTITY (like className), NOT a beat-driven
  // fact — so it is ABSENT from the extraction schema + every tool arg (unwritable by the model, proven by test),
  // reachable only through `patchSheet`. A model bumping "level" off a vibe is the progression-inflation footgun
  // the no-`update_stats` posture exists to prevent; matching marinara's restraint here is the honest call.
  level: z.number().int().min(0).nullable().default(null),
  // The per-actor TRACKER EXCEPTIONS (the unification's applicability model, §5.1). The def carries the class
  // (`party`/`npcs`/`everyone`/an explicit ref list); THIS actor may additionally be GRANTED a tracker the
  // class missed (the one-off — a character who alone carries "Bound Will") or have one REVOKED (a party
  // member with no Mana in a party-wide Mana game). Effective carriers = resolve(appliesTo) + grants − revokes,
  // computed in ONE place (`carriesTracker`, `./tracker`). Tracker KEYS, never labels — a rename never orphans
  // an exception. Hand-only (host/owner authority through `patchSheet`); the model never writes them.
  trackerGrants: z.array(z.string().min(1)).default([]),
  trackerRevokes: z.array(z.string().min(1)).default([]),
});
export type RpgSheet = z.infer<typeof rpgSheetSchema>;
