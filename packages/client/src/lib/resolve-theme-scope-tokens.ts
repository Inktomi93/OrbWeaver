// Resolves what a <ThemeScope> mount actually receives from a theme row (D44 §12.1) — and, its other
// half, which generated `[data-theme]` block that row paints from.
//
// HOMED AT THE UTIL FLOOR, NOT IN app-shell (#920). It has two readers in two features now: the SHELL
// (`app-shell.tsx` — the live palette) and the settings LOOKS collection (`theme-mini-surface.tsx` — the
// thumbnail on every theme card, which must paint each row exactly as selecting it would). A cross-feature
// import is banned (`client-features-no-cross`) and re-spelling the seed guard in the second reader is how
// the thumbnail would drift from the shell: `#lib` is the sanctioned shared-vocabulary floor.
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

/** The generated seed palettes that own a `[data-theme]` block. Hearth is represented by `null` — it IS
 *  the base `@theme`, so it has no block and stamps nothing. */
export type SeedThemeName = keyof typeof SEED_THEME_VALUE_SETS;

/** Boundary guard: a persisted/server string may name only a generated seed palette. */
export function isSeedThemeName(value: string): value is SeedThemeName {
  return Object.hasOwn(SEED_THEME_VALUE_SETS, value);
}

/** THE BASE PALETTE, REPLAYED (#920 + the rendered receipt that caught it). Hearth IS the base `@theme`,
 *  so it owns no `[data-theme]` block and the shell paints it by stamping NOTHING — which is correct AT THE
 *  ROOT, where "nothing above me" and "the base palette" are the same statement. A THUMBNAIL is nested: on
 *  a Light or Mocha root, stamping nothing makes Hearth's card inherit the ambient and paint itself Light
 *  (measured on the isolated stage at `--theme Light` — the Hearth card came back cream). A card that lies
 *  about its own theme is the F2 family, so the base palette is REPLAYED as inline custom properties.
 *
 *  It is not a second home for the palette and not a re-derivation: the KEY SET comes from a generated seed
 *  value-set (every block emits the same keys) and each VALUE is read out of `TOKENS`, the one generated
 *  source `theme.css`'s own `:root` is built from. A key a seed emits that `TOKENS` does not carry emits
 *  nothing rather than a guess — the two generated surfaces cannot disagree without this going empty, which
 *  a test pins. `colorScheme` rides beside it because the base palette is dark and `light-dark()` intent
 *  tokens resolve off the scheme, not off the background. */
const SEED_VAR_KEYS: readonly string[] = Object.keys(Object.values(SEED_THEME_VALUE_SETS)[0]?.vars ?? {});

export const BASE_PALETTE_VARS: Readonly<Record<string, string>> = Object.fromEntries(
  SEED_VAR_KEYS.flatMap((cssVar) => {
    const token = TOKENS[`color.${cssVar.replace("--color-", "")}` as keyof typeof TOKENS] as { readonly value: string } | undefined;
    return token === undefined ? [] : [[cssVar, token.value] as const];
  }),
);

/** The base `@theme`'s own polarity — the arm `light-dark()` resolves to when nothing overrides it. */
export const BASE_PALETTE_COLOR_SCHEME = "dark";

/** The `[data-theme]` value a resolved theme row paints from — the SHELL stamps it on `<html>` and a
 *  THUMBNAIL stamps it on its own box, which is the whole reason this sits beside the token resolver
 *  rather than in either reader: the two answers must be the same answer. A custom theme (and Hearth)
 *  stamps nothing and paints from `tokens` / the base ramp instead. */
export function dataThemeOf(theme: Theme | null): SeedThemeName | null {
  if (theme?.isSeed !== true) {
    return null;
  }
  const name = theme.name.toLowerCase();
  return isSeedThemeName(name) ? name : null;
}

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
