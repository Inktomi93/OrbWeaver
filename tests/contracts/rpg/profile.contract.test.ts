// @orb/contracts/rpg/profile — the statProfile IS the compatibility promise (§2.3). Pins: the schema
// parses the mechanical shape and preserves saved/custom vocabulary independently of live defaults.

import {
  meterDisplayNumber,
  RPG_PROFILE_D20,
  RPG_PROFILE_FREEFORM,
  RPG_PROFILE_MAX_ATTRIBUTES,
  RPG_SEED_HP_MAX,
  rpgGameConfigSchema,
  rpgSeedTrackers,
  rpgStatProfileSchema,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures.ts";

test("freeform is lite's empty-attribute default with an identity-ish modifier", () => {
  expect(RPG_PROFILE_FREEFORM.attributes).toEqual([]);
  expect(RPG_PROFILE_FREEFORM.resolution).toEqual({ kind: "house-d20" });
});

test("d20 ships the classic six with (score-10)/2 modifier dials", () => {
  expect(RPG_PROFILE_D20.attributes.map((a) => a.key)).toEqual(["str", "dex", "con", "int", "wis", "cha"]);
  expect(RPG_PROFILE_D20.modifier).toEqual({ center: 10, step: 2 });
  expect(RPG_PROFILE_D20.range).toEqual({ min: 1, max: 20 });
  expect(RPG_PROFILE_D20.perceptionAttribute).toBe("wis");
});

test("saved non-ruleset profiles preserve their vocabulary and normalization dials", () => {
  const saved = {
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
    skillGoverning: { melee: "strength", ranged: "perception", science: "intelligence" },
    defaultAttribute: "strength",
    perceptionAttribute: "perception",
    resolution: { kind: "house-d20" },
  };
  expect(rpgStatProfileSchema.parse(saved)).toEqual(saved);
  expect(rpgGameConfigSchema.parse({ statProfile: saved }).statProfile).toEqual(saved);
});

test("the schema enforces the ≤12 attribute cap", () => {
  const tooMany = {
    ...RPG_PROFILE_FREEFORM,
    attributes: Array.from({ length: RPG_PROFILE_MAX_ATTRIBUTES + 1 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, hint: "" })),
  };
  expect(rpgStatProfileSchema.safeParse(tooMany).success).toBe(false);
});

test("resolution rejects an unknown discriminant (the reserved single-arm union)", () => {
  const bad = { ...RPG_PROFILE_FREEFORM, resolution: { kind: "gurps" } };
  expect(rpgStatProfileSchema.safeParse(bad).success).toBe(false);
});

// The seeded HP def says "unset counts as full": its first delta spends from the ceiling. The reading a surface
// SHOWS follows, and every other unset meter keeps showing no reading.
test("an unset seeded HP shows its ceiling; a written value, a carrier override and any other pool are untouched", () => {
  const hp = rpgSeedTrackers(RPG_PROFILE_D20)[0];
  expect(hp).toBeDefined();
  if (hp === undefined) {
    return;
  }
  const unset = { value: null, items: null, max: null };
  expect(meterDisplayNumber(hp, unset)).toBe(RPG_SEED_HP_MAX);
  expect(meterDisplayNumber(hp, undefined)).toBe(RPG_SEED_HP_MAX);
  expect(meterDisplayNumber(hp, { value: 7, items: null, max: null })).toBe(7);
  expect(meterDisplayNumber(hp, { value: null, items: null, max: 34 })).toBe(34);
  const other = { ...hp, key: "vitality" };
  expect(meterDisplayNumber(other, unset)).toBeNull();
});

test("the public RPG contract does not publish a dormant template catalog", async () => {
  const rpgContracts = await import("@orb/contracts/rpg");
  expect(Object.hasOwn(rpgContracts, "RPG_PROFILE_SPECIAL")).toBe(false);
  expect(Object.hasOwn(rpgContracts, "RPG_PACKAGED_PROFILE_BY_KEY")).toBe(false);
  expect(Object.hasOwn(rpgContracts, "RPG_PACKAGED_PROFILES")).toBe(false);
});
