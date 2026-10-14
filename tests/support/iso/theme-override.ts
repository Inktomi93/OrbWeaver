import type { ThemeOverride } from "@orb/contracts/theme";
import { themeOverrideSchema } from "@orb/contracts/theme";

/** Builds the theme output component through its owner clamp, without duplicating color or reach policy. */
export function makeThemeOverride(overrides: Partial<ThemeOverride> = {}): ThemeOverride {
  return themeOverrideSchema.parse(overrides);
}
