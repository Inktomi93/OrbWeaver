// @orb/contracts/rpg/profile — the `statProfile` as DATA (rpg-design/05 §2.3). The SHAPE is the
// compatibility promise: lite never computes a modifier (no lite code path reads
// `modifier`/`skillGoverning`/`perceptionAttribute`/`resolution`), but every field ships, populated and
// validated, because full's check engine consumes the profile AS-IS on arrival — zero re-shape at graft.
//
// Home: `config.statProfile` inside the games config blob (§2.3 — no separate profile table until a
// cross-game library exists). `RpgSheet.attributes` is a record over this profile's attribute vocabulary.
//
// The three PACKAGED profiles (`freeform`/`d20`/`special`) ship as contract data constants — pure
// vocabulary (labels + hints + dials) authored fresh from D86 §2.1's published table (common-knowledge
// content; NO differential golden vs legacy is owed — a fresh build has no old engine to stay byte-equal
// to). `freeform` is lite's create default; `d20`/`special` are attribute TEMPLATES lite users pick to
// color a chat (they cost bytes, and shipping them makes the graft map's profile row "full adds nothing").

import { z } from "zod";

/** One attribute definition in a profile's vocabulary — the label-as-mini-prompt (`{key, label, hint}`).
 *  `key` is the machine name (a sheet's `attributes` record keys off it); `label`/`hint` are prompt prose. */
export const rpgStatAttributeDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().default(""),
});
export type RpgStatAttributeDef = z.infer<typeof rpgStatAttributeDefSchema>;

/** The max attribute count a profile may carry (§2.3 — "≤12"). A prompt-budget shape constant. */
export const RPG_PROFILE_MAX_ATTRIBUTES = 12;

/** The RESERVED resolution discriminant (§2.3) — a single-arm union today (`house-d20`). Full's check
 *  engine grows this with alt-arms (the D86 reserved-discriminant growth pattern); lite never reads it. */
export const rpgStatResolutionSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("house-d20") })]);
export type RpgStatResolution = z.infer<typeof rpgStatResolutionSchema>;

/** A `statProfile` — the full mechanical vocabulary, shipped whole. Lite exercises only `attributes`
 *  (via the sheet); the rest is the graft contract. `skillGoverning` maps a skill name → the attribute
 *  key that governs it; `defaultAttribute`/`perceptionAttribute` name attribute keys; `resolution` is the
 *  reserved check-engine discriminant. */
export const rpgStatProfileSchema = z.object({
  attributes: z.array(rpgStatAttributeDefSchema).max(RPG_PROFILE_MAX_ATTRIBUTES),
  range: z.object({ min: z.number().int(), max: z.number().int() }),
  modifier: z.object({ center: z.number().int(), step: z.number().int().min(1) }),
  skillGoverning: z.record(z.string(), z.string()).default({}),
  defaultAttribute: z.string(),
  perceptionAttribute: z.string(),
  resolution: rpgStatResolutionSchema,
});
export type RpgStatProfile = z.infer<typeof rpgStatProfileSchema>;

/** The packaged profile keys — `freeform` is lite's create default; `d20`/`special` are templates. */
export const RPG_PACKAGED_PROFILES = ["freeform", "d20", "special"] as const;
export type RpgPackagedProfileKey = (typeof RPG_PACKAGED_PROFILES)[number];

// The house resolution every packaged profile reserves (lite ignores it; full's engine reads it).
const HOUSE_D20: RpgStatResolution = { kind: "house-d20" };

/** `freeform` — no attributes, wide range, identity modifier. Lite's default: the sheet renders nothing
 *  mechanical, the model steers on prose. Full backfills nothing (there is no attribute vocabulary). */
export const RPG_PROFILE_FREEFORM: RpgStatProfile = {
  attributes: [],
  range: { min: 0, max: 20 },
  modifier: { center: 10, step: 2 },
  skillGoverning: {},
  defaultAttribute: "",
  perceptionAttribute: "",
  resolution: HOUSE_D20,
};

/** `d20` — the classic six (STR/DEX/CON/INT/WIS/CHA), 1–20, `(score-10)/2` modifier (`center 10, step 2`).
 *  Authored fresh from the D86 §2.1 published table (common-knowledge content). Lite uses it as a template. */
export const RPG_PROFILE_D20: RpgStatProfile = {
  attributes: [
    { key: "str", label: "Strength", hint: "raw physical power — lifting, melee force" },
    { key: "dex", label: "Dexterity", hint: "agility, reflexes, aim, balance" },
    { key: "con", label: "Constitution", hint: "stamina, resilience, health" },
    { key: "int", label: "Intelligence", hint: "reasoning, memory, knowledge" },
    { key: "wis", label: "Wisdom", hint: "perception, insight, willpower" },
    { key: "cha", label: "Charisma", hint: "force of personality, persuasion" },
  ],
  range: { min: 1, max: 20 },
  modifier: { center: 10, step: 2 },
  skillGoverning: {
    athletics: "str",
    stealth: "dex",
    endurance: "con",
    lore: "int",
    perception: "wis",
    persuasion: "cha",
  },
  defaultAttribute: "str",
  perceptionAttribute: "wis",
  resolution: HOUSE_D20,
};

/** `special` — the S·P·E·C·I·A·L seven, 1–10, `(score-5)` modifier (`center 5, step 1`). Authored fresh
 *  from D86 §2.1 (common-knowledge). A template lite users pick to color a wasteland chat. */
export const RPG_PROFILE_SPECIAL: RpgStatProfile = {
  attributes: [
    { key: "strength", label: "Strength", hint: "carry weight and melee damage" },
    { key: "perception", label: "Perception", hint: "awareness and ranged accuracy" },
    { key: "endurance", label: "Endurance", hint: "hit points and resistances" },
    { key: "charisma", label: "Charisma", hint: "barter and speech" },
    { key: "intelligence", label: "Intelligence", hint: "skill points and hacking" },
    { key: "agility", label: "Agility", hint: "action points and sneak" },
    { key: "luck", label: "Luck", hint: "crit chance and random fortune" },
  ],
  range: { min: 1, max: 10 },
  modifier: { center: 5, step: 1 },
  skillGoverning: {
    melee: "strength",
    ranged: "perception",
    survival: "endurance",
    speech: "charisma",
    science: "intelligence",
    sneak: "agility",
  },
  defaultAttribute: "strength",
  perceptionAttribute: "perception",
  resolution: HOUSE_D20,
};

/** The packaged profiles keyed for the create dialog's picker. `freeform` is the default. */
export const RPG_PACKAGED_PROFILE_BY_KEY: Readonly<Record<RpgPackagedProfileKey, RpgStatProfile>> = {
  freeform: RPG_PROFILE_FREEFORM,
  d20: RPG_PROFILE_D20,
  special: RPG_PROFILE_SPECIAL,
};
