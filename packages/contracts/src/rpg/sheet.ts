// @orb/contracts/rpg/sheet — the per-actor IDENTITY sheet (rpg-design/05 §4.3). `attributes` is a record
// over the profile's attribute vocabulary; a sheet read treats a MISSING key as absent (lite renders
// nothing; full backfills at `center` when ITS seeding lands — the mutability rule, §2.3). Sheets live in
// `rpg_sheets` (the no-party-system ruling: NOT a membership shadow — keyed by durable actor identity,
// projected roster ∪ rows at read time, created on first write). Full grafts `arc` as an ADD COLUMN.

import { z } from "zod";
import { RPG_HINT_MAX } from "./config";

/** The strict pool-color grammar (panel-redesign, owner-ruled FREE HEX): a 3/6-digit hex or a numeric
 *  `oklch(L C H)` (optional `deg` hue + `/ alpha`) — a COLOR literal, never raw CSS (no `var()`, no
 *  `color-mix()`, no url/expression vector). Free hex deliberately does NOT theme-adapt — accepted: the
 *  bar/orb geometry is decorative (aria-hidden), the value TEXT rides theme tokens. ASCII match, no `u`. */
export const RPG_POOL_COLOR_RE = /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|oklch\(\s*\d+(\.\d+)?%?\s+\d+(\.\d+)?\s+\d+(\.\d+)?(deg)?\s*(\/\s*\d+(\.\d+)?%?\s*)?\))$/;

/** A single pool DEFINITION — the mechanical dial (name + max) plus the host-pickable display `color`
 *  (nullable; null ⇒ the ordinal track-ramp derivation `trackColor(i)`, panel-redesign §12.1.2). ONE schema
 *  home: the sheet blob, the `patchSheet` wire input, and the view projection all derive from THIS (never
 *  re-spell). `color` is hand-only (absent from the extraction schema + every tool arg — unwritable by the
 *  model); a pre-redesign blob heals to null at the parse seam via the `.default`. */
export const rpgPoolDefSchema = z.object({
  name: z.string().min(1),
  max: z.number().int().min(1),
  color: z.string().regex(RPG_POOL_COLOR_RE).nullable().default(null),
  // #36 — the HOST-authored pool MEANING ("mana fuels spellcasting; empty = exhausted"). Host-set like
  // `color` (absent from the extraction schema + every tool arg — unwritable by the model; patchSheet is
  // the only door). Fed into the steering reminder so the model knows what each pool MEANS, and shown as
  // the quiet hint by the meter. A pre-hint blob heals to "" at the parse seam via the `.default`.
  hint: z.string().max(RPG_HINT_MAX).default(""),
});
export type RpgPoolDef = z.infer<typeof rpgPoolDefSchema>;

/** The per-actor character sheet — identity-plane data. `attributes` keys off the game's `statProfile`
 *  vocabulary (an int per attribute); `poolDefs`/`maxHp` are the lite-live mechanical dials the volatile
 *  plane's values track against. `className` is flavor prose. Full ADDS skills/abilities/strengths/
 *  weaknesses/attack/defense/speed as parse-seam-healed JSON fields (§C — no DDL). */
export const rpgSheetSchema = z.object({
  className: z.string().default(""),
  attributes: z.record(z.string(), z.number().int()).default({}),
  poolDefs: z.array(rpgPoolDefSchema).default([]),
  maxHp: z.number().int().min(1).nullable(),
  flavor: z.string().default(""),
  // `level` (parity-plus §2.6) — a HAND-ONLY progression dial the host/player owns. Born null (nullable-honesty:
  // the panel renders nothing, never a phantom "Level 0"). It is IDENTITY (like className), NOT a beat-driven
  // fact — so it is ABSENT from the extraction schema + every tool arg (unwritable by the model, proven by test),
  // reachable only through `patchSheet`. A model bumping "level" off a vibe is the progression-inflation footgun
  // the no-`update_stats` posture exists to prevent; matching marinara's restraint here is the honest call.
  level: z.number().int().min(0).nullable().default(null),
});
export type RpgSheet = z.infer<typeof rpgSheetSchema>;
