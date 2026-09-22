// @orb/contracts/rpg/ruleset — THE RULESET axis (#862, owner ruling 2026-08-30): one game mode, and the
// ruleset is a SETTING. It replaced the start-time `freeform | d20` profile PICK — both doors used to mint
// the identical `lite` game and differ only by which packaged profile they passed, so the choice was a
// setting wearing a door's clothes. A game is now started directly (born `freeform`) and the host retunes
// the ruleset on the Game tab whenever they like.
//
// ONE HOME, THREE CONSUMERS: the config field (`RpgGameConfig.ruleset`), the write door's additive apply
// (`updateConfig`), and the client's dice-ask row (`RPG_RULESET_DICE` — a ruleset with no dice publishes NO
// chips, which is what makes the setting visible; a profile-blind chip row was the dead-toggle finding).
//
// THE SWITCH IS ADDITIVE (OWNER RULING, #862): applying a ruleset ADDS its vocabulary — attributes,
// skill map, seeded trackers — BESIDE what the game already carries. It never removes, never renames, never
// asks for a confirmation, and switching back hides nothing (`freeform` adds nothing, so the d20 vocabulary
// a host picked up stays). That is why the apply is a pure MERGE over contract data and lives here rather
// than as a re-profile arm in the verb: the law is the data, the verb only commits it.
//
// `special` is NOT a ruleset arm: it is a packaged attribute TEMPLATE a host reaches through the stat-profile
// editor (`RPG_PACKAGED_PROFILE_BY_KEY`). The segmented control offers exactly the two arms the two retired
// start doors offered.

import { z } from "zod";
import type { RpgStatProfile } from "./profile.ts";
import { RPG_PROFILE_D20, RPG_PROFILE_FREEFORM, rpgSeedTrackers } from "./profile.ts";
import type { RpgTrackerDef } from "./tracker.ts";

/** The ruleset axis — the ONE tuple (§5.5); the config field, the wire input and the segmented control all
 *  derive from it, so a third ruleset is one row here plus the `tsc`-forced records below. */
export const RPG_RULESETS = ["freeform", "d20"] as const;
export type RpgRuleset = (typeof RPG_RULESETS)[number];
export const rpgRulesetSchema = z.enum(RPG_RULESETS) satisfies z.ZodType<RpgRuleset>;

/** The default a game is BORN with — prose-steered play, no mechanical vocabulary at all (the retired
 *  "Freeform story" door's arm, now the birth default because starting is one action). */
export const RPG_RULESET_DEFAULT: RpgRuleset = "freeform";

/** The stat vocabulary each ruleset carries. Exhaustive over the axis (a new member fails `tsc` here). */
export const RPG_RULESET_PROFILE: Readonly<Record<RpgRuleset, RpgStatProfile>> = {
  freeform: RPG_PROFILE_FREEFORM,
  d20: RPG_PROFILE_D20,
};

/** The host-facing label + its honest one-line consequence, keyed over the axis (the delivery-model
 *  segmented-control precedent — an arm cannot ship without saying what it does). */
export const RPG_RULESET_LABEL: Readonly<Record<RpgRuleset, string>> = {
  freeform: "Freeform",
  d20: "D20",
};
export const RPG_RULESET_CONSEQUENCE: Readonly<Record<RpgRuleset, string>> = {
  freeform: "no dice, no attributes — the story is steered by prose alone",
  d20: "adds the six d20 attributes, a health meter and the dice row above the composer",
};

/** The dice a ruleset offers above the composer (the B8 ask row). Notation is the server's own
 *  `NdM(+/-K)?` grammar (`domain/rpg/verbs/roll-dice.ts`); the row is capped to the band's four chips.
 *  `freeform` offers NONE — a freeform table rolls nothing, and four d20-family chips over a freeform game
 *  contradicted the door's own copy (side-eye 2026-08-30). An empty set publishes no controls at all, so the
 *  band collapses (`empty:hidden`) exactly as it does on a plain chat. */
export const RPG_RULESET_DICE: Readonly<Record<RpgRuleset, readonly string[]>> = {
  freeform: [],
  d20: ["d20", "d6", "2d6", "d100"],
};

/** The vocabulary a ruleset apply operates on — the two config planes it may ADD to. */
export interface RpgRulesetVocabulary {
  readonly statProfile: RpgStatProfile;
  readonly trackers: readonly RpgTrackerDef[];
}

/** Merge one ruleset's vocabulary INTO a game's current vocabulary (the owner's additive ruling).
 *
 *  The rules, all one-directional (nothing the game already carries is dropped or rewritten):
 *   • attributes — appended by KEY; a key the game already defines keeps ITS label/hint (the host's own
 *     wording, or a renamed packaged attribute, wins over the template's).
 *   • `skillGoverning` — union, the game's entry winning a name clash.
 *   • the scalars (`range`/`modifier`/`defaultAttribute`/`perceptionAttribute`) — adopted from the incoming
 *     ruleset ONLY where the game has nothing: a game with zero attributes carries the freeform placeholders
 *     (empty default/perception, the 0–20 range), and keeping those would leave the d20 vocabulary
 *     un-rollable. A game that already has attributes keeps every scalar it tuned.
 *   • trackers — appended by KEY (the ruleset's seeded defs, e.g. d20's HP meter); an existing key is kept
 *     verbatim, and a def the host DELETED stays deleted unless the ruleset actually changes (the verb only
 *     applies on a CHANGE, so re-picking the current arm never resurrects anything).
 *  `freeform` carries no attributes and seeds no trackers, so applying it is a NO-OP by construction — which
 *  is precisely the owner's "switching back hides nothing". */
export function applyRulesetVocabulary(current: RpgRulesetVocabulary, ruleset: RpgRuleset): RpgRulesetVocabulary {
  const incoming = RPG_RULESET_PROFILE[ruleset];
  const haveKeys = new Set(current.statProfile.attributes.map((a) => a.key));
  const attributes = [...current.statProfile.attributes, ...incoming.attributes.filter((a) => !haveKeys.has(a.key))];
  const bare = current.statProfile.attributes.length === 0;
  const trackerKeys = new Set(current.trackers.map((t) => t.key));
  return {
    statProfile: {
      attributes,
      range: bare ? incoming.range : current.statProfile.range,
      modifier: bare ? incoming.modifier : current.statProfile.modifier,
      skillGoverning: { ...incoming.skillGoverning, ...current.statProfile.skillGoverning },
      defaultAttribute: current.statProfile.defaultAttribute === "" ? incoming.defaultAttribute : current.statProfile.defaultAttribute,
      perceptionAttribute: current.statProfile.perceptionAttribute === "" ? incoming.perceptionAttribute : current.statProfile.perceptionAttribute,
      resolution: current.statProfile.resolution,
    },
    trackers: [...current.trackers, ...rpgSeedTrackers(incoming).filter((t) => !trackerKeys.has(t.key))],
  };
}
