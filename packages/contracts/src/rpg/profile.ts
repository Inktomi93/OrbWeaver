// Game-owned stat vocabulary and modifier normalization; identity scores remain human-authored.
// Human-requested ability rolls use the modifier. Resolution, skills and perception remain full-engine contracts.
// D281: Freeform and D20 defaults preserve saved custom profiles and additive ruleset application.

import { z } from "zod";
import type { RpgTrackerDef, RpgTrackerValue } from "./tracker.ts";
import { trackerCeiling, trackerNumber } from "./tracker.ts";

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

/** A `statProfile` — the full mechanical vocabulary, shipped whole. Manual ability rolls read `attributes` and `modifier`; the remaining fields reserve the full-engine contract. `skillGoverning` maps a skill name → the attribute
 *  key that governs it; `defaultAttribute`/`perceptionAttribute` name attribute keys; `resolution` is the
 *  reserved check-engine discriminant.
 *
 *  ── THE COHERENCE INVARIANTS ARE ENFORCED AT THE WRITE DOOR, NOT HERE (#1371 items 2/3) ──
 *  Four states this schema permits are incoherent: duplicate `attributes` keys, an inverted
 *  `range` (`min > max`), and a `defaultAttribute`/`perceptionAttribute` naming a key the profile does not
 *  declare. They are REFUSED — by `assertProfileMutable` in `domain/rpg/verbs/game/update-config.ts`,
 *  which is already this class's chosen enforcer (it refuses a dangling `skillGoverning` entry with
 *  `rpg_profile_dangling_skill`, and a referenced attribute removal), and pinned by that verb's suite.
 *
 *  They are deliberately NOT `.refine()`s on this schema, and the reason is the read path: the whole
 *  `rpgGameConfigSchema` is PARSE-ON-READ (`domain/rpg/persistence/games.ts` `parseGameRow`) and a parse
 *  failure raises `RpgStateCorruptError` — so a refine added here does not reject a bad WRITE, it makes
 *  every EXISTING game whose stored blob predates the rule permanently unreadable. A host who deleted the
 *  attribute their `defaultAttribute` named has such a blob today, and the read path handles it gracefully
 *  on purpose (`attributeReading` prints the raw key). Tier-4 refusal at the producer verb closes the state
 *  going forward without bricking a stored one; that is the trade, stated. */
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

/** Convert a set attribute score to the profile's shared modifier space. */
export function rpgAttributeModifier(profile: RpgStatProfile, score: number): number {
  return Math.floor((score - profile.modifier.center) / profile.modifier.step);
}

/** ONE attribute's VOCABULARY gloss — `Strength (raw physical power — lifting, melee force)`, the hint
 *  omitted when empty. The same `label value (hint)` grammar `trackerGloss` uses, split across two surfaces
 *  because attributes are a fixed vocabulary shared by every sheet: the MEANING is taught ONCE (this line),
 *  and each actor's line then carries only `label value` ({@link attributeReading}). Teaching the hint per
 *  actor would multiply the profile's prose by the party size for zero extra information.
 *
 *  Without this the reminder printed raw `str 14` pairs: the key, not the host's label, and never the hint —
 *  the label-as-mini-prompt (and the packaged d20 profiles' real steering prose) reached the model NOWHERE.
 *  That is the R4b class exactly: a lever that exists in the schema and dies in the read path. */
export function attributeGloss(def: RpgStatAttributeDef): string {
  return def.hint === "" ? def.label : `${def.label} (${def.hint})`;
}

/** One actor's attribute reading — `Strength 14`, by LABEL (the vocabulary line carries the meaning). An
 *  attribute value whose key is not in the profile prints its raw key: honest about stored-but-unvocabularied
 *  data, never silently dropped. */
export function attributeReading(defs: readonly RpgStatAttributeDef[], key: string, value: number): string {
  const def = defs.find((d) => d.key === key);
  return `${def?.label ?? key} ${value}`;
}

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
 *  Authored fresh from the D86 §2.1 published table (common-knowledge content). The D20 ruleset applies it additively. */
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SEEDED TRACKERS (R3) — the profile's half of hp's demotion.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// `hp` used to be a schema-privileged field on every actor: a `hp: {value,max} | null` leaf, a bespoke
// `hpDelta` tool arm, a named reminder seg, a dedicated delta renderer, and a SECOND max home on the sheet.
// It is now an ordinary `meter` tracker, which means a game only has health if its game says so — and the
// lived default was already hp-absent (a real freeform session renders zero hp anywhere, `untangle-status.png`).
// So the demotion has no default-UX regression: a MECHANICAL profile seeds the def at mint and reads exactly as
// before, and `freeform` seeds nothing and finally stops carrying a null health track it never used.

/** The seeded HP meter's key — how a surface tells it from a host-defined pool. */
const RPG_SEED_HP_KEY = "hp";

/** The default ceiling the seeded HP meter is born with. A per-CARRIER ceiling that differs on purpose rides
 *  `RpgTrackerValue.max` through the one `trackerCeiling` resolver (the d20 max-HP reality the unification's
 *  per-carrier override was designed for) — this is only the game-wide default the host can retune. */
export const RPG_SEED_HP_MAX = 20;

/** The seeded HP def. `write:"delta"` because damage and healing are spends/restores (that axis is what picks
 *  the model's tool arm); `appliesTo:"everyone"` because an NPC bleeds like a party member; `pinned` so it
 *  rides the band orbs through the ordinary `trackerOrbs` path rather than a bespoke hp-orb arm.
 *
 *  The `hint` states the unset rule, because an unset meter shows the model no reading: a delta on a
 *  carried-but-unset meter spends from its ceiling, so an untouched carrier reads as full. */
const SEEDED_HP_TRACKER: RpgTrackerDef = {
  key: RPG_SEED_HP_KEY,
  label: "HP",
  shape: "meter",
  write: "delta",
  subject: "actor",
  appliesTo: "everyone",
  max: RPG_SEED_HP_MAX,
  hint: "physical health — damage lowers it, rest and care restore it; unset counts as full",
  color: null,
  icon: null,
  sort: 0,
  pinned: true,
  locked: false,
};

/** The reading a meter SHOWS: its stored number, or, for the seeded HP meter with none written, its ceiling. The HP
 *  def's rule is "unset counts as full" (a first delta spends from the ceiling), so an untouched carrier is full, not
 *  empty. Display only: nothing is written, and every other unset meter stays `null`. */
export function meterDisplayNumber(def: RpgTrackerDef, value: RpgTrackerValue | undefined): number | null {
  const reading = trackerNumber(value);
  return reading === null && def.key === RPG_SEED_HP_KEY ? trackerCeiling(def, value) : reading;
}

/** The tracker defs a game MINTS with, given its profile (D71's "new theme = a json" pattern applied to game
 *  birth: the profile is the data, this is the one derivation).
 *
 *  The rule is the profile's own attribute VOCABULARY, not its name: a profile that models a body with
 *  attributes is a game where health is a mechanic, and one with no attributes at all (`freeform`) is a game
 *  steered by prose, where a health bar nobody set is furniture. That covers the D20 ruleset vocabulary and
 *  any saved or custom profile a host builds, without a name lookup that a renamed profile would silently fall out of.
 *  A host may delete or redefine the seeded def immediately afterwards; nothing re-seeds it. */
export function rpgSeedTrackers(profile: RpgStatProfile): readonly RpgTrackerDef[] {
  return profile.attributes.length === 0 ? [] : [SEEDED_HP_TRACKER];
}
