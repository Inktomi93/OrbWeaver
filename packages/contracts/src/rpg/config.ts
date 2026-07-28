// @orb/contracts/rpg/config — the `rpg_games.config` JSON blob (rpg-design/05 §4.1). Holds the
// `statProfile` (§2.3 — no separate profile table until a cross-game library exists) + the lite dials.
// Full's dials (`genres`/`tones`/`setting`/`difficulty`/`rating`/`language`/`playerGoals`/`gm`/
// `houseRules`/`imagery`/`assist`) graft as ADDITIVE defaulted fields — a JSON-column additive lift
// self-heals at the parse seam (no version stamp needed, unlike `user_settings`: rpg tables carry no
// versioned-config columns, so the schema_version DEFAULT question is moot).

import { z } from "zod";
import { MAX_USER_MACROS, userMacroSchema } from "#preset";
import { RPG_CAST_FIELD_KINDS } from "./enums";
import { RPG_PROFILE_FREEFORM, rpgStatProfileSchema } from "./profile";

/** The steering-note cap — a short always-wins user slot (the reminder tail, §4.7). */
export const RPG_STEERING_NOTE_MAX = 500;

/** The steering-hint cap — a short prose gloss (M1 relationship hints + §2.8 cast-field hints). */
export const RPG_HINT_MAX = 120;

/** A host-DEFINED tracked cast-field schema (parity-plus §2.8). The host declares which fields cast members
 *  carry per game; the model writes DEFINED keys only (enum-constrained at projection, §2.3). `meter` renders a
 *  0-max `TrackBar` and diffs numerically; `text` is a free chip diffed as a transition. First-class beats the
 *  opaque `customFields` record: a defined schema gets the vocab constraint, the meter render, the hint, the
 *  numeric delta — none of which an opaque record could give. */
export const rpgCastFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(RPG_CAST_FIELD_KINDS),
  max: z.number().int().min(1).optional(),
  hint: z.string().max(RPG_HINT_MAX).optional(),
});
export type RpgCastField = z.infer<typeof rpgCastFieldSchema>;

/** The per-game FEATURE knobs (parity-plus §9 — the create-time options + advanced config). Additive defaulted
 *  fields on the JSON blob, self-healing at the parse seam (no version stamp — rpg tables carry no versioned
 *  column). `castFields` empty = the cast-field feature is OFF (no half-state — a defined field or nothing).
 *  `relationshipHints` maps a custom relationship `label` → a steering gloss (M1: a bare custom label steers as
 *  precisely as the five built-ins when the host glosses it; the hint is a property of the VOCAB, one home, not
 *  duplicated per cast row). */
export const rpgGameFeaturesSchema = z.object({
  castFields: z.array(rpgCastFieldSchema).default([]),
  relationshipHints: z.record(z.string(), z.string().max(RPG_HINT_MAX)).default({}),
});
export type RpgGameFeatures = z.infer<typeof rpgGameFeaturesSchema>;

/** The delivery-model knob (the 2026-07-26 amendment). `reliable` = a dedicated structured-output extraction
 *  turn proves state landed; `cheap` = the state tools ride the character turn, best-effort. An ADDITIVE
 *  config field, default `"reliable"` — a pre-amendment blob self-heals to the default at the parse seam
 *  (the schema `.default` fills it; no version stamp — §4.11 #1 / D107 knob-wire discipline). */
export const RPG_EXTRACTION_MODES = ["reliable", "cheap"] as const;
export type RpgExtractionMode = (typeof RPG_EXTRACTION_MODES)[number];

/** The `rpg_games.config` blob. `lite.steeringNote` is the always-wins user tuning slot (§4.11 #2 — a
 *  real shipped knob). `statProfile` defaults to `freeform` (lite's create default). `extractionMode` is the
 *  delivery-model knob (the amendment), default `"reliable"`. */
export const rpgGameConfigSchema = z.object({
  statProfile: rpgStatProfileSchema.default(RPG_PROFILE_FREEFORM),
  lite: z
    .object({
      steeringNote: z.string().max(RPG_STEERING_NOTE_MAX).default(""),
    })
    .default({ steeringNote: "" }),
  extractionMode: z.enum(RPG_EXTRACTION_MODES).default("reliable"),
  // The parity-plus feature knobs (§2.8/§2.1 M1) — additive, self-healing at the parse seam (a pre-P1 blob
  // fills the defaults: no cast-fields, no relationship hints).
  features: rpgGameFeaturesSchema.default({ castFields: [], relationshipHints: {} }),
  // WAVE MU (§12A.5 M5, owner ruling #20): GAME-authored user macros — the game half of the two-home
  // definition rule (preset `promptConfig.userMacros` is the other; ONE schema, imported from #preset).
  // Additive defaulted — a pre-MU blob self-heals to [] at the parse seam. Registered with source
  // `{kind:"game", id:<chatId>}` by the macro-feed threading (kit `registerUserMacros`).
  userMacros: z.array(userMacroSchema).max(MAX_USER_MACROS).default([]),
});
export type RpgGameConfig = z.infer<typeof rpgGameConfigSchema>;
