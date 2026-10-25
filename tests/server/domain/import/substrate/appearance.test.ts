// @subject packages/server/src/domain/import/substrate/appearance.ts
// ST's `reduced_motion` lands on orb's three-way setting: ST's true forces reduced motion, its false defers to the device.
import { expect, test } from "@orb/testkit/node";
import { ST_POWER_USER_KEY, stAppearancePatch } from "#server/domain/import/substrate/appearance.ts";

// ST's own power_user keys, as its settings.json spells them.
const ST_REDUCED_MOTION = "reduced_motion";
const ST_FONT_SCALE = "font_scale";

test.for([
  [true, { reducedMotion: "on" }],
  [false, { reducedMotion: "system" }],
  ["true", {}],
  [1, {}],
  [null, {}],
] as const)("ST reduced_motion %j patches %j", ([stored, patch]) => {
  expect(stAppearancePatch({ [ST_POWER_USER_KEY]: { [ST_REDUCED_MOTION]: stored } })).toEqual(patch);
});

test("a profile without reduced_motion patches no motion setting", () => {
  expect(stAppearancePatch({ [ST_POWER_USER_KEY]: { [ST_FONT_SCALE]: 1.25 } })).not.toHaveProperty("reducedMotion");
});
