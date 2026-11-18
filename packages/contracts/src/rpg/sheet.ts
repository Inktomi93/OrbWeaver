// @orb/contracts/rpg/sheet — the per-actor IDENTITY sheet. `attributes` is a record
// over the profile's attribute vocabulary; a sheet read treats a MISSING key as absent (lite renders
// nothing; full backfills at `center` when ITS seeding lands). Sheets live in
// `rpg_sheets` (the no-party-system ruling: NOT a membership shadow — keyed by durable actor identity,
// projected participants ∪ rows at read time, created on first write). Full grafts `arc` as an ADD COLUMN.
//
// TRACKER DEFS DO NOT LIVE HERE: a second home would make the same concept
// per-ACTOR here and per-GAME in the config, which is what forces a define/value/pin dance across tabs.
// Defs home ONCE in `config.trackers[]`; what the sheet keeps is the per-actor
// EXCEPTION pair — this actor's grants and revokes against the def-level carrier classes.

// Strip mode: these schemas also read imported files and stored rows, which can carry keys this release does not declare; the wire parses a strict form (`strictTwin` or a `.strict()` view).
import { z } from "zod";

/** The per-actor character sheet — identity-plane data. `attributes` keys off the game's `statProfile`
 *  vocabulary (an int per attribute); `className` is flavor prose. Full ADDS
 *  skills/abilities/strengths/weaknesses/attack/defense/speed as parse-seam-healed JSON fields (no DDL).
 *
 *  `maxHp` is not here: a meter's per-carrier ceiling has ONE home (`RpgTrackerValue.max`, resolved through
 *  `trackerCeiling`), health included. A second max on the sheet had no reconciler, which is the drift class
 *  the one-home rule exists to kill. */
export const rpgSheetSchema = z
  .object({
    className: z.string().default(""),
    attributes: z.record(z.string(), z.int()).default({}),
    flavor: z.string().default(""),
    // `level` — a HAND-ONLY progression dial the host/player owns. Born null (nullable-honesty:
    // the panel renders nothing, never a phantom "Level 0"). It is IDENTITY (like className), NOT a beat-driven
    // fact — so it is ABSENT from the extraction schema + every tool arg (unwritable BY PLAY): a
    // model bumping "level" off a vibe is the progression-inflation footgun the no-`update_stats` posture exists
    // to prevent, and matching marinara's restraint there is the honest call.
    // TWO write doors, both host-driven and neither of them a turn: `patchSheet` (the
    // hand edit) and `populateFromCharacter` (the ONE sanctioned model doorway — a host-clicked, per-character,
    // one-shot round over the character CARD + the room's opening, which FILLS this only while it is still null;
    // `rpgPopulateSchema`, a schema no turn vehicle rides). Birth is not progression.
    level: z.int().min(0).nullable().default(null),
    // The per-actor TRACKER EXCEPTIONS (the applicability model). The def carries the class
    // (`party`/`npcs`/`everyone`/an explicit ref list); THIS actor may additionally be GRANTED a tracker the
    // class missed (the one-off — a character who alone carries "Bound Will") or have one REVOKED (a party
    // member with no Mana in a party-wide Mana game). Effective carriers = resolve(appliesTo) + grants − revokes,
    // computed in ONE place (`carriesTracker`, `./tracker`). Tracker KEYS, never labels — a rename never orphans
    // an exception. Hand-only (host authority through `patchSheet`); the model never writes them.
    trackerGrants: z.array(z.string().min(1)).default([]),
    trackerRevokes: z.array(z.string().min(1)).default([]),
  })
  .strip();
export type RpgSheet = z.infer<typeof rpgSheetSchema>;
