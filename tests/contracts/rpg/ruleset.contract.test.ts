// contracts/rpg/ruleset — the RULESET axis and the ADDITIVE apply (#862, owner ruling 2026-08-30: "applying
// a ruleset ADDS its vocabulary beside what exists; switching back hides nothing; no data loss").
//
// The apply is contract DATA, not verb logic, so the owner's ruling is pinned HERE — the write door only
// decides when it runs. The round trip (d20 → freeform → d20) is the ruling's sharpest edge: every switch
// must be lossless, including the one that returns to a ruleset with no vocabulary at all.

import type { RpgStatProfile, RpgTrackerDef } from "@orb/contracts/rpg";
import { applyRulesetVocabulary, RPG_PROFILE_D20, RPG_PROFILE_FREEFORM, RPG_RULESET_DICE, RPG_RULESETS, rpgRulesetSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures.ts";

/** A host-authored tracker — the thing a switch must never touch. */
const HOUSE_TRACKER: RpgTrackerDef = {
  key: "grit",
  label: "Grit",
  shape: "meter",
  write: "delta",
  subject: "actor",
  appliesTo: "party",
  max: 6,
  hint: "",
  color: null,
  icon: null,
  sort: 3,
  pinned: false,
  locked: false,
};

test("the ruleset axis excludes unsupported vocabulary selections", () => {
  expect([...RPG_RULESETS]).toEqual(["freeform", "d20"]);
  expect(rpgRulesetSchema.safeParse("special").success).toBe(false);
});

test("the dice row follows the ruleset — freeform offers NONE (the setting's visible consequence)", () => {
  expect(RPG_RULESET_DICE.freeform).toEqual([]);
  expect(RPG_RULESET_DICE.d20).toEqual(["d20", "d6", "2d6", "d100"]);
});

test("applying d20 to a freeform game ADDS its vocabulary and seeds HP, keeping the host's own trackers", () => {
  const next = applyRulesetVocabulary({ statProfile: RPG_PROFILE_FREEFORM, trackers: [HOUSE_TRACKER] }, "d20");
  expect(next.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  // The freeform placeholders (empty default/perception, the 0–20 range) would leave the new vocabulary
  // un-rollable, so a game with NO attributes adopts the incoming scalars.
  expect(next.statProfile.defaultAttribute).toBe("str");
  expect(next.statProfile.range).toEqual(RPG_PROFILE_D20.range);
  expect(next.trackers.map((t) => t.key)).toEqual(["grit", "hp"]);
});

test("THE OWNER RULING: a d20 → freeform → d20 round trip loses NOTHING — no attribute, no tracker, no host edit", () => {
  const authored: RpgStatProfile = {
    ...RPG_PROFILE_D20,
    attributes: [...RPG_PROFILE_D20.attributes.map((a) => (a.key === "str" ? { ...a, label: "Might" } : a)), { key: "luck", label: "Luck", hint: "" }],
  };
  const start = { statProfile: authored, trackers: [HOUSE_TRACKER] };

  const toFreeform = applyRulesetVocabulary(start, "freeform");
  // `freeform` adds nothing at all — "switching back hides nothing" is a NO-OP by construction.
  expect(toFreeform).toEqual(start);

  const back = applyRulesetVocabulary(toFreeform, "d20");
  expect(back.statProfile.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha", "luck"]);
  // The host's RENAME survives the re-apply: an existing key keeps the game's own wording, never the
  // template's (an apply that overwrote labels would be a silent data loss dressed as an add).
  expect(back.statProfile.attributes.find((a) => a.key === "str")?.label).toBe("Might");
  expect(back.trackers.map((t) => t.key)).toEqual(["grit", "hp"]);
});

test("an apply never duplicates a key it already carries, and never re-seeds a tracker that is present", () => {
  const seeded = applyRulesetVocabulary({ statProfile: RPG_PROFILE_FREEFORM, trackers: [] }, "d20");
  const twice = applyRulesetVocabulary(seeded, "d20");
  expect(twice.statProfile.attributes).toEqual(seeded.statProfile.attributes);
  expect(twice.trackers).toEqual(seeded.trackers);
});
