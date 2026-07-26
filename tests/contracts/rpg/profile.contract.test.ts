// @orb/contracts/rpg/profile — the statProfile IS the compatibility promise (§2.3). Pins: the schema
// parses/validates the full mechanical shape, the ≤12 attribute cap, and that all three packaged profiles
// (freeform/d20/special) parse + carry the reserved fields lite never reads (the graft contract).

import {
  RPG_PACKAGED_PROFILE_BY_KEY,
  RPG_PACKAGED_PROFILES,
  RPG_PROFILE_D20,
  RPG_PROFILE_FREEFORM,
  RPG_PROFILE_MAX_ATTRIBUTES,
  RPG_PROFILE_SPECIAL,
  rpgStatProfileSchema,
} from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("all three packaged profiles are shipped and parse against the schema", () => {
  expect(RPG_PACKAGED_PROFILES).toEqual(["freeform", "d20", "special"]);
  for (const key of RPG_PACKAGED_PROFILES) {
    const profile = RPG_PACKAGED_PROFILE_BY_KEY[key];
    expect(rpgStatProfileSchema.safeParse(profile).success).toBe(true);
  }
});

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

test("special ships the SPECIAL seven with (score-5) modifier dials", () => {
  expect(RPG_PROFILE_SPECIAL.attributes).toHaveLength(7);
  expect(RPG_PROFILE_SPECIAL.modifier).toEqual({ center: 5, step: 1 });
  expect(RPG_PROFILE_SPECIAL.range).toEqual({ min: 1, max: 10 });
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
