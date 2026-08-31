// The DERIVED custom-property spellings for one picked base surface — extracted from `clamp.ts` at the
// component-size split (#243), on the same seam `color-parse.ts` was cut along: the clamp keeps the
// POLICY (what parses, what is dropped, which field wins), this file owns the CSS a base surface derives.
//
// Everything here is relative-colour syntax off the ONE picked base, so the browser does the arithmetic
// and any legal base format works — the numbers are `@orb/kit/theme-derivation`'s (the ONE home; the ST
// theme importer predicts the same math in node). Two values cannot be spelled for the browser and are
// solved in node instead: the reading plate's polarity-derived alpha (#217) and the elevation arm (#243).
import type { RampDeltas, ShadowIngredients } from "@orb/kit/theme-derivation";
import { chartRampForSurface, READING_BAND_ALPHA, rampDeltas, readingPlateAlpha, shadowIngredients, THEME_DERIVATION } from "@orb/kit/theme-derivation";
import type { ParsedOklch } from "./color-parse.ts";

// The neutral surface ramp: each `--color-*` paired with the RampDeltas member that names its L shift,
// applied via CSS relative-color-syntax so any base color format works and only L shifts (hue + chroma
// held). WHICH ARM those deltas come from is `rampDeltas(base)`'s decision (#682) — a light base's chrome
// recedes rather than saturating at white — so the deltas are read per call, not frozen at module load.
const SURFACE_RAMP_VARS: ReadonlyArray<readonly [name: string, role: keyof RampDeltas]> = [
  ["--color-sidebar", "sidebar"],
  ["--color-surface-raised", "surfaceRaised"],
  ["--color-card", "card"],
  ["--color-popover", "popover"],
  ["--color-accent", "accent"],
  ["--color-sidebar-accent", "sidebarAccent"],
  ["--color-secondary", "secondary"],
  ["--color-muted", "muted"],
];

// Contrast-safe foreground derivation: L flips light↔dark around a pivot with a steep step, so any
// surface lighter than the pivot gets near-black text and darker gets near-white — a foreground is
// never picked directly, only derived, so "set everything white" can't produce invisible text.
const FG_PIVOT_L = THEME_DERIVATION.fgPivotL;
const FG_STEEPNESS = THEME_DERIVATION.fgSteepness;
const FG_L_MIN = THEME_DERIVATION.fgLMin;
const FG_L_MAX = THEME_DERIVATION.fgLMax;
const CONTRAST_L = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
const BORDER_ALPHA = THEME_DERIVATION.borderAlpha;
const INPUT_ALPHA = THEME_DERIVATION.inputAlpha;
// Muted foreground: same pivot flip, softer band, tuned to clear WCAG AA (>=4.5:1) against the
// derived input fill on both light and dark bases.
const MUTED_L_MIN = THEME_DERIVATION.mutedLMin;
const MUTED_L_MAX = THEME_DERIVATION.mutedLMax;
const MUTED_CONTRAST_L = `clamp(${MUTED_L_MIN}, (${FG_PIVOT_L} - l) * ${FG_STEEPNESS}, ${MUTED_L_MAX})`;

/** A contrast-safe foreground for text sitting on `surface` (any validated color) — browser-computed.
 *  Exported because the clamp derives it for two PICKED colours too (the accent and each bubble bg),
 *  which are not part of the one-base cascade below. */
export function foregroundOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h)`;
}
// Computed single-level off the base (the pivot flip reads l + deltaL, never a nested relative-color
// of an already-derived surface) so it stays the same shape as every other derived token.
function foregroundOnShifted(base: string, deltaL: number): string {
  const shiftedL = `clamp(${FG_L_MIN}, (${FG_PIVOT_L} - (l + ${deltaL})) * ${FG_STEEPNESS}, ${FG_L_MAX})`;
  return `oklch(from ${base} ${shiftedL} 0 h)`;
}
/** A contrast-safe muted foreground (secondary text/placeholders) for `surface`. */
function mutedForegroundOn(surface: string): string {
  return `oklch(from ${surface} ${MUTED_CONTRAST_L} 0 h)`;
}
/** A subtle contrast border derived from `surface`. */
function borderOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h / ${BORDER_ALPHA})`;
}
/** The input-field surface lift derived from `surface`, composited over any surface. */
function inputSurfaceOn(surface: string): string {
  return `oklch(from ${surface} ${CONTRAST_L} 0 h / ${INPUT_ALPHA})`;
}
/** An unjudgeable base gets an OPAQUE plate — see {@link readingPlateOn}. */
const UNJUDGEABLE_PLATE_ALPHA = 1;
/**
 * The over-art reading plate for a picked base: the same one-base L shift the ramp rides, but carrying
 * its own alpha (it composites over wallpaper art), so it is spelled here rather than in the alphaless
 * ramp loop.
 *
 * The ALPHA is polarity-aware and DERIVED IN NODE (#217, `readingPlateAlpha` — the algebra and the
 * dark-arm owner ruling live on that function): a LIGHT plate's composite over DARK art is the failing
 * case (the same ink measured 3.48:1 and 4.94:1 in one room at two scroll positions), so a light base
 * gets the alpha that keeps the reference ink at AA over worst-case art while a dark base keeps the
 * measured 0.65 floor. It is the one derived number the browser CANNOT compute for us — relative-colour
 * syntax has no contrast operator — so it lands as a literal, judged off the parsed base.
 *
 * A base neither reader resolves (`base === null`: a named colour, modern unitless `hsl()`) cannot be
 * judged at all, so it gets an OPAQUE plate. Failing open on POLARITY is the safe direction
 * (`colorSchemeFor`); failing open on the READING FLOOR would ship the #217 defect on exactly the
 * palettes nothing can prove. Opacity costs the art, never the reader.
 */
function readingPlateOn(background: string, base: ParsedOklch | null): string {
  const alpha = base === null ? UNJUDGEABLE_PLATE_ALPHA : readingPlateAlpha({ l: base.l, c: base.c, h: base.h });
  return `oklch(from ${background} calc(l + ${THEME_DERIVATION.readingPlate.deltaL}) c h / ${alpha})`;
}

/**
 * The STICKY ATTRIBUTION BAND for a picked base (#241): the plate's colour at `READING_BAND_ALPHA`.
 *
 * It is spelled as the SAME one-base L shift rather than as a relative colour off the emitted plate
 * (`oklch(from var(--color-reading-plate) l c h / 1)`) for two reasons, both load-bearing: the plate's
 * alpha is polarity-DERIVED in node, so a var-origin form would make the band's value depend on a
 * substitution this function cannot judge; and every other derived token here is computed single-level
 * off the base, never nested off an already-derived surface (see `foregroundOnShifted`). The alpha slot
 * is spelled EXPLICITLY — relative-colour syntax inherits the ORIGIN's alpha for an omitted slot, and
 * the origin here is a background that may itself be translucent.
 *
 * It needs no `base` and no fail-open arm: unlike the plate's alpha there is nothing to solve, so an
 * unjudgeable base (a named colour) still gets a correct band.
 */
function readingBandOn(background: string): string {
  return `oklch(from ${background} calc(l + ${THEME_DERIVATION.readingPlate.deltaL}) c h / ${READING_BAND_ALPHA})`;
}

/** The `--color-shadow-*` ingredient names, in the ONE order the emit list and the derivation pair by. */
const SHADOW_INGREDIENT_VARS = {
  hairline: "--color-shadow-hairline",
  highlight: "--color-shadow-highlight",
  ambientNear: "--color-shadow-ambient-near",
  ambientFar: "--color-shadow-ambient-far",
  ctaHighlight: "--color-shadow-cta-highlight",
} as const satisfies Record<keyof ShadowIngredients, string>;

/**
 * The five ELEVATION INGREDIENTS for a picked base (#243) — `shadowIngredients` decides the polarity arm
 * off the base's L (the same `FG_PIVOT_L` the foreground flip and `color-scheme` ride), this spells it.
 *
 * Emitted as relative colour so the HUE is the palette's own: only l/c/alpha come from the derivation,
 * exactly like every other derived token here. The alpha slot is spelled EXPLICITLY — relative-colour
 * syntax inherits the ORIGIN's alpha for an omitted slot, and the origin is a background that may be
 * translucent (the same trap the ink clamp and the reading band each name).
 *
 * A base neither reader resolves gets NOTHING (the caller's `base === null` arm): polarity is not
 * statically knowable, and guessing it is how a light palette would get dark-arm smoke — `colorSchemeFor`'s
 * rule. Failing open leaves the scope inheriting the app theme's ingredients, the pre-#243 behaviour.
 */
function shadowVarsOn(background: string, base: ParsedOklch): Readonly<Record<string, string>> {
  const derived = shadowIngredients({ l: base.l, c: base.c, h: base.h });
  const out: Record<string, string> = {};
  for (const [role, name] of Object.entries(SHADOW_INGREDIENT_VARS)) {
    const ingredient = derived[role as keyof ShadowIngredients];
    out[name] = `oklch(from ${background} ${ingredient.l} ${ingredient.c} h / ${ingredient.alpha})`;
  }
  return out;
}

/** Concrete categorical fills for DOM and Canvas chart consumers. Unlike neutral chrome these cannot be
 * relative-color expressions: ECharts needs the cascade to resolve each property into a paintable color. */
function chartVarsOn(base: ParsedOklch): Readonly<Record<string, string>> {
  const ramp = chartRampForSurface(base);
  return Object.fromEntries(ramp.map((color, index) => [`--color-chart-${index + 1}`, `oklch(${color.l} ${color.c} ${color.h})`]));
}

/**
 * EVERYTHING one picked base surface derives — the neutral ramp, the over-art plate + band, every neutral
 * foreground, the border/input fills, and the elevation ingredients. One cascade, one entry point, so the
 * clamp itself stays a field-by-field pass over the override.
 *
 * `base` is the CARRIED background parsed (`null` when neither reader resolves it): the plate falls back
 * to opaque, and the elevation ingredients are skipped entirely — polarity is not statically knowable, and
 * guessing it is exactly how a light palette would keep dark-arm smoke (`colorSchemeFor`'s rule). Never the
 * AMBIENT base (#236): this runs only when a background IS carried, and these must answer THIS surface.
 */
export function surfaceVarsOn(background: string, base: ParsedOklch | null): Readonly<Record<string, string>> {
  // The ramp's POLARITY ARM (#682). An unjudgeable base keeps the DARK arm rather than emitting nothing:
  // unlike the plate's alpha and the elevation ingredients, the ramp IS the chrome — a scope that carried
  // a background but no surfaces would paint the app theme's panels inside a custom room. Failing open to
  // the pre-#682 block is the one choice that leaves such a scope byte-identical to what it emitted
  // before, and polarity is exactly as unknowable here as it is for `colorSchemeFor`.
  const deltas = base === null ? THEME_DERIVATION.ramp.dark : rampDeltas({ l: base.l, c: base.c, h: base.h });
  const vars: Record<string, string> = { "--color-background": background };
  for (const [name, role] of SURFACE_RAMP_VARS) {
    vars[name] = `oklch(from ${background} calc(l + ${deltas[role]}) c h)`;
  }
  vars["--color-reading-plate"] = readingPlateOn(background, base);
  vars["--color-reading-band"] = readingBandOn(background);
  // The accent's foreground reads the SAME arm's accent delta — a foreground derived off a shift the
  // surface no longer takes is the polarity divorce this whole file exists to prevent.
  vars["--color-accent-foreground"] = foregroundOnShifted(background, deltas.accent);
  const fg = foregroundOn(background);
  vars["--color-foreground"] = fg;
  vars["--color-card-foreground"] = fg;
  vars["--color-popover-foreground"] = fg;
  vars["--color-sidebar-foreground"] = fg;
  vars["--color-secondary-foreground"] = fg;
  vars["--color-muted-foreground"] = mutedForegroundOn(background);
  vars["--color-border"] = borderOn(background);
  vars["--color-sidebar-border"] = borderOn(background);
  vars["--color-input"] = inputSurfaceOn(background);
  return base === null ? vars : { ...vars, ...shadowVarsOn(background, base), ...chartVarsOn(base) };
}
