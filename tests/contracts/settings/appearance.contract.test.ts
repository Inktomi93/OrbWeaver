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

// #1365 — the whole-array `.catch([])` meant ONE malformed row erased the entire saved library, and because
// the catch made the parse SUCCEED, `userSettingsConfig.parseOutcome` reported `intact: true`, so the #471
// write guard (`requireIntactStoredConfig`) could not see the loss and the next unrelated settings save
// persisted it. Element-wise tolerance: one bad row costs one row.
test("backgroundLibrary drops ONLY the malformed row (#1365) — the valid rows survive", () => {
  const row = (n: number): Record<string, unknown> => ({
    entryId: `e${n}`,
    assetId: `asset_01h4kxt2e8z9y3b1n7m6q5r4s${n}`,
    assetHash: `h${n}`,
    mime: "image/png",
    name: `bg${n}`,
  });
  const parsed = appearanceSettingsSchema.parse({ backgroundLibrary: [row(1), { ...row(2), assetId: 12_345 }, row(3)] });
  expect(parsed.backgroundLibrary.map((entry) => entry.entryId)).toEqual(["e1", "e3"]);
});

// The ONE whole-collection fallback left: a value that is not an array has no element-wise reading, and the
// schema must stay TOTAL for the boot hint (see this file's header).
test("backgroundLibrary falls back to empty ONLY when the stored value is not an array", () => {
  expect(appearanceSettingsSchema.parse({ backgroundLibrary: "not an array" }).backgroundLibrary).toEqual([]);
  expect(appearanceSettingsSchema.parse({}).backgroundLibrary).toEqual([]);
});

// The #1365 sweep's deliberate EXCEPTION, pinned so the next sweep does not "finish the job": blurSurfaces
// keeps whole-collection self-heal because an empty set is a meaningful stored value here (a deliberate
// "blur nothing"), so element-wise filtering would fabricate one out of an unreadable blob.
test("blurSurfaces self-heals to the shipped default set, NOT to a fabricated opt-out (#1365 exception)", () => {
  expect(appearanceSettingsSchema.parse({ blurSurfaces: ["fog"] }).blurSurfaces).toEqual([...DEFAULT_BLUR_SURFACES]);
  // An explicitly-stored empty set is the real opt-out and survives untouched.
  expect(appearanceSettingsSchema.parse({ blurSurfaces: [] }).blurSurfaces).toEqual([]);
});
