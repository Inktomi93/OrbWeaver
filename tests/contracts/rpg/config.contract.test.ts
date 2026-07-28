// @orb/contracts/rpg/config — the rpg_games.config blob (§4.1). Pins: statProfile defaults to freeform,
// the steeringNote cap, and that an empty blob self-heals to the born-default config.

import { isDeceptionActive, RPG_PROFILE_FREEFORM, RPG_RECENT_BEATS_KEEP_DEFAULT, RPG_STEERING_NOTE_MAX, rpgGameConfigSchema } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("an empty config parses to the born-default (freeform profile, empty steeringNote)", () => {
  const config = rpgGameConfigSchema.parse({});
  expect(config.statProfile).toEqual(RPG_PROFILE_FREEFORM);
  expect(config.lite.steeringNote).toBe("");
});

// P3 §3.3/§3.6: the hidden-channel + recent-beats knobs self-heal (a pre-P3 blob fills the defaults, no version
// stamp) — deception/omniscience OFF, hiddenContentReveal ON, recentBeatsKeepLast at the default.
test("the P3 feature knobs self-heal to their defaults on a pre-P3 blob", () => {
  const features = rpgGameConfigSchema.parse({}).features;
  expect(features.deception).toBe(false);
  expect(features.omniscience).toBe(false);
  expect(features.hiddenContentReveal).toBe(true);
  expect(features.recentBeatsKeepLast).toBe(RPG_RECENT_BEATS_KEEP_DEFAULT);
});

test("isDeceptionActive is true iff either hidden channel is on (the ONE reasoning-strip predicate)", () => {
  const base = rpgGameConfigSchema.parse({}).features;
  expect(isDeceptionActive(base)).toBe(false);
  expect(isDeceptionActive({ ...base, deception: true })).toBe(true);
  expect(isDeceptionActive({ ...base, omniscience: true })).toBe(true);
  expect(isDeceptionActive({ ...base, deception: true, omniscience: true })).toBe(true);
});

test("recentBeatsKeepLast rejects a negative (a slice count must be ≥ 0)", () => {
  expect(rpgGameConfigSchema.safeParse({ features: { recentBeatsKeepLast: -1 } }).success).toBe(false);
  expect(rpgGameConfigSchema.parse({ features: { recentBeatsKeepLast: 0 } }).features.recentBeatsKeepLast).toBe(0);
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
