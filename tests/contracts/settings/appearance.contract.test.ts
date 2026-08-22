// The `appearance` section's own module + its deep exports door (#448). The section moved OUT of
// `settings/index.ts` so the client's pre-paint boot hint can reach the contract's own schema object without
// composing the whole `UserSettings` tree (which drags the contracts prose corpus into the boot chunk).
// What these pins protect: the move is a FILE split, not an ownership move or a second copy — the barrel and
// the deep door must hand back the SAME object, and the schema must stay TOTAL, because
// `state/appearance-boot-hint.ts` parses an untrusted durable-local blob through it before React mounts
// (ab192aedf: one set of bounds, never a client copy).

import { DEFAULT_USER_SETTINGS, appearanceSettingsSchema as viaBarrel } from "@orb/contracts/settings";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema, BLUR_SURFACES, DEFAULT_BLUR_SURFACES } from "@orb/contracts/settings/appearance";
import { expect, test } from "../../support/fixtures.ts";

const OUT_OF_RANGE_FONT_SCALE = 99;

test("the settings barrel re-exports the deep module's schema OBJECT — one home, never a copy", () => {
  expect(viaBarrel).toBe(appearanceSettingsSchema);
});

test("the section's parse is TOTAL: an empty blob yields the same defaults the composed UserSettings does", () => {
  const fromSection: AppearanceSettings = appearanceSettingsSchema.parse({});
  expect(fromSection).toStrictEqual(DEFAULT_USER_SETTINGS.appearance);
});

test("every key catches, so an untrusted blob self-heals instead of throwing (the boot hint's contract)", () => {
  const healed = appearanceSettingsSchema.parse({
    fontScale: OUT_OF_RANGE_FONT_SCALE,
    density: "not-a-density",
    reducedMotion: "yes",
    blurSurfaces: "not-an-array",
    backgroundLibrary: [{ entryId: 1 }],
  });
  expect(healed.fontScale).toBe(DEFAULT_USER_SETTINGS.appearance.fontScale);
  expect(healed.density).toBe(DEFAULT_USER_SETTINGS.appearance.density);
  expect(healed.reducedMotion).toBe(false);
  expect(healed.blurSurfaces).toStrictEqual([...DEFAULT_BLUR_SURFACES]);
  expect(healed.backgroundLibrary).toStrictEqual([]);
});

test("the shipped blur default is the three chrome surfaces — `messages` stays opt-in (Reading Surface)", () => {
  expect(BLUR_SURFACES).toContain("messages");
  expect(DEFAULT_BLUR_SURFACES).not.toContain("messages");
});
