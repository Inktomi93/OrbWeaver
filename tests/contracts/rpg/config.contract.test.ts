// @orb/contracts/rpg/config — the rpg_games.config blob (§4.1). Pins: statProfile defaults to freeform,
// the steeringNote cap, and that an empty blob self-heals to the born-default config.

import { RPG_PROFILE_FREEFORM, RPG_STEERING_NOTE_MAX, rpgGameConfigSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("an empty config parses to the born-default (freeform profile, empty steeringNote)", () => {
  const config = rpgGameConfigSchema.parse({});
  expect(config.statProfile).toEqual(RPG_PROFILE_FREEFORM);
  expect(config.lite.steeringNote).toBe("");
});

test("the steeringNote is capped (a short always-wins user slot)", () => {
  const tooLong = { lite: { steeringNote: "x".repeat(RPG_STEERING_NOTE_MAX + 1) } };
  expect(rpgGameConfigSchema.safeParse(tooLong).success).toBe(false);
  const ok = { lite: { steeringNote: "lean darker" } };
  expect(rpgGameConfigSchema.parse(ok).lite.steeringNote).toBe("lean darker");
});

// WAVE MU: the GAME-home half of the two-home user-macro rule (§12A.5) — additive defaulted [], the
// SAME userMacroSchema as preset (imported from #preset), so a pre-MU blob self-heals and a bad def rejects.
test("userMacros is the game-home for authored macros — defaults [], accepts a valid def, rejects a bad name", () => {
  expect(rpgGameConfigSchema.parse({}).userMacros).toEqual([]);
  const withMacro = rpgGameConfigSchema.parse({ userMacros: [{ name: "gmTone", body: "The GM speaks {{tone}}" }] });
  expect(withMacro.userMacros[0]).toMatchObject({ name: "gmTone", body: "The GM speaks {{tone}}", strict: false });
  expect(rpgGameConfigSchema.safeParse({ userMacros: [{ name: "2bad", body: "x" }] }).success).toBe(false);
});
