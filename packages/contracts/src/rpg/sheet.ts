// @orb/contracts/rpg/sheet — the per-actor IDENTITY sheet (rpg-design/05 §4.3). `attributes` is a record
// over the profile's attribute vocabulary; a sheet read treats a MISSING key as absent (lite renders
// nothing; full backfills at `center` when ITS seeding lands — the mutability rule, §2.3). Sheets live in
// `rpg_sheets` (the no-party-system ruling: NOT a membership shadow — keyed by durable actor identity,
// projected roster ∪ rows at read time, created on first write). Full grafts `arc` as an ADD COLUMN.

import { z } from "zod";

/** The per-actor character sheet — identity-plane data. `attributes` keys off the game's `statProfile`
 *  vocabulary (an int per attribute); `poolDefs`/`maxHp` are the lite-live mechanical dials the volatile
 *  plane's values track against. `className` is flavor prose. Full ADDS skills/abilities/strengths/
 *  weaknesses/attack/defense/speed as parse-seam-healed JSON fields (§C — no DDL). */
export const rpgSheetSchema = z.object({
  className: z.string().default(""),
  attributes: z.record(z.string(), z.number().int()).default({}),
  poolDefs: z.array(z.object({ name: z.string().min(1), max: z.number().int().min(1) })).default([]),
  maxHp: z.number().int().min(1).nullable(),
  flavor: z.string().default(""),
});
export type RpgSheet = z.infer<typeof rpgSheetSchema>;
