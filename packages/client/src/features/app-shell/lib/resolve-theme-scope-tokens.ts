// Resolves what the app-shell's <ThemeScope> and grid actually receive from the ACTIVE theme (D44 §12.1).
// A SEED theme paints ENTIRELY from its generated `[data-theme]` block in @orb/ui theme.css (keyed by the
// lowercased name); its stored `override` is ONLY the duplicate-to-customize template. Feeding that
// override back through <ThemeScope> would let clampThemeTokens re-derive the 34 vars and shadow the
// hand-tuned block (canary: system-bubble fg derives bright off the bg instead of the muted 0.74 intent),
// and its density/chatStyle would stomp the user's appearance prefs. So for a seed we pass NOTHING and let
// the user's appearance density win; a custom theme flows its own override + density through unchanged.
// Extracted + tested so a refactor can't silently re-pass a seed's override into the render path.

//
// IT ALSO RESOLVES THE AMBIENT BASE (#236) — the surface the app actually PAINTS, which the §7a prose-ink
// clamp needs in order to judge a card that carries inks and no background of its own. A seed paints from
// its generated block, so its base is that block's `--color-background` (SEED_THEME_VALUE_SETS, the ONE
// source the block is generated from); Hearth and "no theme at all" paint the base `@theme` ramp, so
// theirs is TOKENS' own background. A custom theme carries its pick in `tokens`; its ambient is the base
// ramp physically underneath that pick, so ThemeScope can composite alpha before deriving chrome.
// Without this the ST-imported library's inks landed unjudged on the Light seed at 2.11:1.

import type { Theme, ThemeDensity, ThemeOverride } from "@orb/contracts/theme";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";

export interface ResolvedThemeScope {
  /** The custom-property overrides handed to <ThemeScope> — `{}` for a seed/absent theme. */
  readonly tokens: ThemeOverride;
  /** The resolved shell density — a custom theme's own override wins; a seed/absent theme yields the appearance pref. */
  readonly density: ThemeDensity;
  /** The base surface the ACTIVE theme paints — <ThemeScope>'s ambient root, a judging input only (#236). */
  readonly ambientBackground: string;
  /** The accent the ACTIVE theme paints — <ThemeScope>'s ambient-ACCENT root, a judging input only (#692).
   *  Resolved from the same three sources as the base, for the same reason: a carried palette that picks a
   *  background and no accent inherits THIS value, and `--color-primary` is the one token no base derives. */
  readonly ambientAccent: string;
}

/** The base `@theme` ramp's own surface — what paints when no `[data-theme]` block is in force. */
const BASE_THEME_BACKGROUND = TOKENS["color.background"].value;
/** …and its accent, the ambient-accent chain's fallback for exactly the same three cases (#692). */
const BASE_THEME_ACCENT = TOKENS["color.primary"].value;

/** Every seed's painted base + accent, keyed the way the `[data-theme]` block is (the lowercased name). */
const SEED_AMBIENTS: Readonly<Record<string, { readonly background: string; readonly accent: string }>> = Object.fromEntries(
  Object.entries(SEED_THEME_VALUE_SETS).map(([name, set]) => [name, { background: set.vars["--color-background"], accent: set.vars["--color-primary"] }]),
);

/** Hearth has no value-set: it IS the base `@theme`, so it falls through to the base ramp — both members. */
function seedAmbient(name: string): { readonly background: string; readonly accent: string } {
  return SEED_AMBIENTS[name.toLowerCase()] ?? { background: BASE_THEME_BACKGROUND, accent: BASE_THEME_ACCENT };
}

export function resolveThemeScopeTokens(theme: Theme | null, appearanceDensity: ThemeDensity): ResolvedThemeScope {
  if (theme === null) {
    return { tokens: {}, density: appearanceDensity, ambientBackground: BASE_THEME_BACKGROUND, ambientAccent: BASE_THEME_ACCENT };
  }
  if (theme.isSeed === true) {
    const ambient = seedAmbient(theme.name);
    return { tokens: {}, density: appearanceDensity, ambientBackground: ambient.background, ambientAccent: ambient.accent };
  }
  return {
    tokens: theme.override,
    density: theme.override.density ?? appearanceDensity,
    // The custom pick is carried IN `tokens`; ambient is the opaque surface physically underneath it.
    // ThemeScope composites alpha-bearing picks over this and passes the resolved pixel to nested scopes.
    ambientBackground: BASE_THEME_BACKGROUND,
    ambientAccent: theme.override.accent ?? BASE_THEME_ACCENT,
  };
}
