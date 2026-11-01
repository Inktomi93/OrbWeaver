// The DERIVED custom-property spellings for one picked base surface — extracted from `clamp.ts` at the
// component-size split (#243), on the same seam `color-parse.ts` was cut along: the clamp keeps the
// POLICY (what parses, what is dropped, which field wins), this file owns the CSS a base surface derives.
//
// Everything here is relative-colour syntax off the ONE picked base, so the browser does the arithmetic
// and any legal base format works — the numbers are `@orb/kit/theme-derivation`'s (the ONE home; the ST
// theme importer predicts the same math in node). Two values cannot be spelled for the browser and are
// solved in node instead: the reading plate's polarity-derived alpha (#217) and the elevation arm (#243).
import type { CarriedInks, Oklch, RampDeltas, ShadowIngredients } from "@orb/kit/theme-derivation";
import {
  bubbleFills,
  carriedInks,
  chartRampForSurface,
  derivedForegroundLightness,
  derivedForegroundLightnessForSurfaces,
  READING_BAND_ALPHA,
  rampDeltas,
  rampSurface,
  readingPlateAlpha,
  readingPlateForeground,
  shadowIngredients,
  solveFocusRing,
  solveInputBorder,
  surfacePolarity,
  THEME_DERIVATION,
} from "@orb/kit/theme-derivation";
import { TOKENS } from "#tokens";
import type { ParsedOklch } from "./color-parse.ts";
import { serializeOpaqueOklch } from "./color-parse.ts";
import { THEME_OVERRIDE_COLOR_VARS } from "./emit-vars.ts";

/** A carried background's resolved pixel and its neutral inks, solved once and read by every derivation over it. */
export interface CarriedPalette {
  readonly pixel: ParsedOklch;
  readonly inks: CarriedInks;
}

/** The carried palette of a resolved base pixel, `null` when no pixel resolved. */
export function carriedPaletteOf(pixel: ParsedOklch): CarriedPalette;
export function carriedPaletteOf(pixel: ParsedOklch | null): CarriedPalette | null;
export function carriedPaletteOf(pixel: ParsedOklch | null): CarriedPalette | null {
  return pixel === null ? null : { pixel, inks: carriedInks({ l: pixel.l, c: pixel.c, h: pixel.h }) };
}

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

const BORDER_ALPHA = THEME_DERIVATION.borderAlpha;
const INPUT_ALPHA = THEME_DERIVATION.inputAlpha;

function foregroundAt(base: string, lightness: number): string {
  return `oklch(from ${base} ${lightness} 0 h / 1)`;
}
/** A subtle contrast border derived from `surface`. */
function borderOn(surface: string, base: Oklch): string {
  return `oklch(from ${surface} ${derivedForegroundLightness(base)} 0 h / ${BORDER_ALPHA})`;
}
/** The input-field wash derived from `surface`, composited over any surface. */
function inputSurfaceOn(surface: string, wash: number): string {
  return `oklch(from ${surface} ${wash} 0 h / ${INPUT_ALPHA})`;
}
/**
 * A text field's fill. A dark carried palette takes the solved input wash, which the page and muted inks are judged on: the
 * static dark arm is a white lift that a mid-tone page cannot carry. A light one keeps the opaque light arm, restated so a
 * scope nested in a dark carried one does not inherit that scope's wash.
 */
function fieldFillOn(surface: string, wash: number, base: Oklch): string {
  return surfacePolarity(base) === "dark" ? inputSurfaceOn(surface, wash) : TOKENS["color.field-fill"].value;
}
/** A truly unjudgeable provider-less base gets an OPAQUE plate — see {@link readingPlateOn}. */
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
 * `base === null` means neither the carried value nor an ambient backing resolved (a provider-less
 * contextual/invalid value), so it gets an OPAQUE plate. Opacity costs the art, never the reader.
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
 * unjudgeable provider-less base still gets a correct band.
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
 * from the base's measured polarity (the same decision foregrounds and `color-scheme` ride), this spells it.
 *
 * Emitted as relative colour so the HUE is the palette's own: only l/c/alpha come from the derivation,
 * exactly like every other derived token here. The alpha slot is spelled EXPLICITLY — relative-colour
 * syntax inherits the ORIGIN's alpha for an omitted slot, and the origin is a background that may be
 * translucent (the same trap the ink clamp and the reading band each name).
 *
 * A base with neither a readable color nor ambient gets NOTHING (`base === null`): polarity is not
 * statically knowable. Failing open leaves the scope inheriting the app theme's ingredients.
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

/** The painted ramp pixels of a carried base, shared by the derived foregrounds and the form-control edge solve. */
function carriedSurfaces(
  opaqueBase: Oklch,
  deltas: RampDeltas,
): Readonly<Record<"raised" | "card" | "popover" | "sidebar" | "accent" | "sidebarAccent" | "secondary" | "muted", Oklch>> {
  return {
    raised: rampSurface(opaqueBase, deltas.surfaceRaised),
    card: rampSurface(opaqueBase, deltas.card),
    popover: rampSurface(opaqueBase, deltas.popover),
    sidebar: rampSurface(opaqueBase, deltas.sidebar),
    accent: rampSurface(opaqueBase, deltas.accent),
    sidebarAccent: rampSurface(opaqueBase, deltas.sidebarAccent),
    secondary: rampSurface(opaqueBase, deltas.secondary),
    muted: rampSurface(opaqueBase, deltas.muted),
  };
}

/** What a scope reports when its form-control edge could not hold both bounds (D159): the edge it paints, and whether the 3:1 floor itself held. */
export interface InputBorderFallback {
  readonly edge: string;
  readonly floorMet: boolean;
}

export interface InputBorderEmission {
  readonly vars: Readonly<Record<string, string>>;
  readonly fallback: InputBorderFallback | undefined;
}

/**
 * `--color-input-border` for a carried base (D159). The seeds keep the static light-dark token; a carried palette owns its
 * panels, so it solves the edge over them (`solveInputBorder` states the bounds). `ring` is the focus ring the scope
 * would paint, `null` when the scope has no known accent, which leaves only the floor to judge. The emission raises
 * `--color-ring` along its hue toward a margin above the edge (`solveFocusRing`); only a hue with no ring above the edge
 * leaves a reported fallback.
 */
export function inputBorderOn(origin: string, carried: CarriedPalette, ring: Oklch | null): InputBorderEmission {
  const solve = carriedEdgeOn(carried);
  const edge = foregroundAt(origin, solve.edge.l);
  const held = heldRingOn(solve, ring);
  return { vars: { "--color-input-border": edge, ...held.vars }, fallback: solve.floorMet && held.held ? undefined : { edge, floorMet: solve.floorMet } };
}

/**
 * The focus ring of a scope that paints its own accent and no background over a carried scope (D159): held above the edge
 * the outer scope solved, which this scope inherits and never re-emits. It reports that edge only when no ring on the
 * accent's hue sits above it.
 */
export function nestedRingOn(carried: CarriedPalette, ring: Oklch): InputBorderEmission {
  const solve = carriedEdgeOn(carried);
  const held = heldRingOn(solve, ring);
  return { vars: held.vars, fallback: held.held ? undefined : { edge: serializeOpaqueOklch(solve.edge), floorMet: solve.floorMet } };
}

interface CarriedEdge {
  readonly edge: Oklch;
  readonly floorMet: boolean;
  /** The card both the edge and the ring are judged on. */
  readonly card: Oklch;
}

/** The form-control edge a carried palette solves over its own panels and the `bg-input` fill on each (`solveInputBorder` states the bounds). */
function carriedEdgeOn({ pixel: base, inks }: CarriedPalette): CarriedEdge {
  const opaqueBase: Oklch = { l: base.l, c: base.c, h: base.h };
  const surfaces = carriedSurfaces(opaqueBase, rampDeltas(opaqueBase));
  const solve = solveInputBorder({
    base: opaqueBase,
    inkLightness: inks.foreground,
    grounds: {
      panels: [opaqueBase, ...Object.values(surfaces)],
      fillInk: { l: inks.muted.inputWash, c: 0, h: base.h },
      fillAlpha: INPUT_ALPHA,
    },
  });
  return { ...solve, card: surfaces.card };
}

/**
 * Focus must out-shout rest: the ring held above the edge along its own hue, leaving the accent fill (`--color-primary`)
 * alone. `held` is false only when no ring on the hue sits above the edge; a `null` ring has nothing to judge.
 */
function heldRingOn({ edge, card }: CarriedEdge, ring: Oklch | null): { readonly vars: Readonly<Record<string, string>>; readonly held: boolean } {
  if (ring === null) {
    return { vars: {}, held: true };
  }
  const held = solveFocusRing({ ring, edge, card });
  return { vars: held === null || held === ring ? {} : { "--color-ring": serializeOpaqueOklch(held) }, held: held !== null };
}

/**
 * EVERYTHING one picked base surface derives — the neutral ramp, the over-art plate + band, every neutral
 * foreground, the border/input fills, and the elevation ingredients. One cascade, one entry point, so the
 * clamp itself stays a field-by-field pass over the override.
 *
 * `carried` is the carried background's resolved palette (`null` only with no readable value/ambient):
 * the plate falls back to opaque and elevation ingredients are skipped only in that provider-less arm.
 */
export function surfaceVarsOn(background: string, carried: CarriedPalette | null, derivedOrigin = background): Readonly<Record<string, string>> {
  const base = carried?.pixel ?? null;
  // The ramp's POLARITY ARM (#682). An unjudgeable base keeps the DARK arm rather than emitting nothing:
  // unlike the plate's alpha and the elevation ingredients, the ramp IS the chrome — a scope that carried
  // a background but no surfaces would paint the app theme's panels inside a custom room. Failing open to
  // the pre-#682 block is the one choice that leaves such a scope byte-identical to what it emitted
  // before, and polarity is genuinely unknowable without either a parsed color or ambient.
  const deltas = base === null ? THEME_DERIVATION.ramp.dark : rampDeltas({ l: base.l, c: base.c, h: base.h });
  // Alpha-bearing and out-of-gamut picks derive their chrome from the opaque pixel they actually paint
  // over the ambient backing. The authored spelling still owns --color-background; only the derived
  // family uses this normalized origin, so transparent custom themes inherit coherent Hearth/seed chrome.
  const origin = derivedOrigin;
  const opaqueSuffix = origin === background ? "" : " / 1";
  const vars: Record<string, string> = { [THEME_OVERRIDE_COLOR_VARS.background]: background };
  for (const [name, role] of SURFACE_RAMP_VARS) {
    vars[name] = `oklch(from ${origin} calc(l + ${deltas[role]}) c h${opaqueSuffix})`;
  }
  vars["--color-reading-plate"] = readingPlateOn(origin, base);
  vars["--color-reading-band"] = readingBandOn(origin);
  if (carried === null) {
    return vars;
  }

  const { pixel } = carried;
  const opaqueBase: Oklch = { l: pixel.l, c: pixel.c, h: pixel.h };
  const surfaces = carriedSurfaces(opaqueBase, deltas);
  // Every bubble emits its fill and its paired ink: the root literals are Hearth's, so a bubble left unemitted
  // would paint Hearth's fill, or a moved fill under Hearth's ink. D336 judges the fill at the ramp member it binds.
  const fills = bubbleFills(opaqueBase);
  for (const [fillVar, inkVar, fill] of [
    ["--color-user-bubble", "--color-user-bubble-foreground", fills.user],
    ["--color-ai-bubble", "--color-ai-bubble-foreground", fills.ai],
    ["--color-system-bubble", "--color-system-bubble-foreground", fills.system],
  ] as const) {
    vars[fillVar] = `oklch(from ${origin} calc(l + ${fill.delta}) ${fill.neutral ? "0" : "c"} h${opaqueSuffix})`;
    const painted = rampSurface(opaqueBase, fill.delta);
    vars[inkVar] = foregroundAt(origin, derivedForegroundLightness(fill.neutral ? { ...painted, c: 0 } : painted));
  }
  // The accent ink covers muted too: they are the neutral tone's two tints, and its text-on-tint is this ink (D336).
  vars["--color-accent-foreground"] = foregroundAt(origin, carried.inks.accentForeground);
  vars["--color-foreground"] = foregroundAt(origin, carried.inks.foreground);
  vars["--color-card-foreground"] = foregroundAt(origin, derivedForegroundLightness(surfaces.card));
  vars["--color-popover-foreground"] = foregroundAt(origin, derivedForegroundLightness(surfaces.popover));
  // List rows wear this ink on the page as well as on the rail.
  vars["--color-sidebar-foreground"] = foregroundAt(origin, derivedForegroundLightnessForSurfaces([opaqueBase, surfaces.sidebar]));
  vars["--color-sidebar-accent-foreground"] = foregroundAt(origin, derivedForegroundLightness(surfaces.sidebarAccent));
  vars["--color-secondary-foreground"] = foregroundAt(origin, derivedForegroundLightness(surfaces.secondary));
  const mutedPair = carried.inks.muted;
  vars["--color-muted-foreground"] = foregroundAt(origin, mutedPair.lightness);
  vars["--color-reading-plate-foreground"] = foregroundAt(origin, readingPlateForeground(opaqueBase).l);
  vars["--color-border"] = borderOn(origin, opaqueBase);
  vars["--color-sidebar-border"] = borderOn(origin, opaqueBase);
  vars["--color-input"] = inputSurfaceOn(origin, mutedPair.inputWash);
  vars["--color-field-fill"] = fieldFillOn(origin, mutedPair.inputWash, opaqueBase);
  return { ...vars, ...shadowVarsOn(origin, pixel), ...chartVarsOn(pixel) };
}
