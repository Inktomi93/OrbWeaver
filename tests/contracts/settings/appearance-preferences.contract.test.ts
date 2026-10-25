// The three OS preferences (reduced motion, reduced transparency, increased contrast) are `system | on | off`,
// defaulting to `system`; a stored boolean from the two-way reduced-motion setting parses forward through the schema.

import { USER_SETTINGS_SCHEMA_VERSION, userSettingsConfig } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { expect, test } from "@orb/testkit/node";

test("a fresh account follows the system for all three preferences", () => {
  const parsed = appearanceSettingsSchema.parse({});
  expect([parsed.reducedMotion, parsed.reducedTransparency, parsed.increasedContrast]).toEqual(["system", "system", "system"]);
});

test.for([
  [true, "on"],
  [false, "system"],
] as const)("a stored reducedMotion %s reads as %s", ([stored, mode]) => {
  expect(appearanceSettingsSchema.parse({ reducedMotion: stored }).reducedMotion).toBe(mode);
});

test("a stored user settings blob with the old boolean is read intact, so the next save keeps the user's other settings", () => {
  // The stored version column, as `domain/settings/persistence/queries.ts` passes it.
  const outcome = userSettingsConfig.parseOutcome({ appearance: { reducedMotion: true, fontScale: 1.25 } }, USER_SETTINGS_SCHEMA_VERSION);
  expect(outcome.intact).toBe(true);
  expect(outcome.value.appearance.reducedMotion).toBe("on");
  expect(outcome.value.appearance.fontScale).toBe(1.25);
});

test.for(["system", "on", "off"] as const)("each mode %s round-trips on every preference", (mode) => {
  const parsed = appearanceSettingsSchema.parse({ reducedMotion: mode, reducedTransparency: mode, increasedContrast: mode });
  expect([parsed.reducedMotion, parsed.reducedTransparency, parsed.increasedContrast]).toEqual([mode, mode, mode]);
});

test("an unreadable value heals to system rather than overriding the OS", () => {
  const parsed = appearanceSettingsSchema.parse({ reducedMotion: "always", reducedTransparency: 1, increasedContrast: true });
  expect([parsed.reducedMotion, parsed.reducedTransparency, parsed.increasedContrast]).toEqual(["system", "system", "system"]);
});
