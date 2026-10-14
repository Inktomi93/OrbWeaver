import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";

/** Builds the complete appearance output component through its production defaulting parser. */
export function makeAppearanceSettings(overrides: Partial<AppearanceSettings> = {}): AppearanceSettings {
  return appearanceSettingsSchema.parse(overrides);
}
