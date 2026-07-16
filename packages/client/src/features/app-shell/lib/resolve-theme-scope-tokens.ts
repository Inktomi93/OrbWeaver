// Resolves what the app-shell's <ThemeScope> and grid actually receive from the ACTIVE theme (D44 §12.1).
// A SEED theme paints ENTIRELY from its generated `[data-theme]` block in @orb/ui theme.css (keyed by the
// lowercased name); its stored `override` is ONLY the duplicate-to-customize template. Feeding that
// override back through <ThemeScope> would let clampThemeTokens re-derive the 34 vars and shadow the
// hand-tuned block (canary: system-bubble fg derives bright off the bg instead of the muted 0.74 intent),
// and its density/chatStyle would stomp the user's appearance prefs. So for a seed we pass NOTHING and let
// the user's appearance density win; a custom theme flows its own override + density through unchanged.
// Extracted + tested so a refactor can't silently re-pass a seed's override into the render path.

import type { Theme, ThemeDensity, ThemeOverride } from "@orb/contracts/theme";

export interface ResolvedThemeScope {
  /** The custom-property overrides handed to <ThemeScope> — `{}` for a seed/absent theme. */
  readonly tokens: ThemeOverride;
  /** The resolved shell density — a custom theme's own override wins; a seed/absent theme yields the appearance pref. */
  readonly density: ThemeDensity;
}

export function resolveThemeScopeTokens(theme: Theme | null, appearanceDensity: ThemeDensity): ResolvedThemeScope {
  if (theme === null || theme.isSeed === true) {
    return { tokens: {}, density: appearanceDensity };
  }
  return { tokens: theme.override, density: theme.override.density ?? appearanceDensity };
}
