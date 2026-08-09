// The D71 theme-DERIVATION numbers and the pure colour math that reasons about them — the ONE home.
//
// Kit-homed for the same reason `safe-color` is: its consumers span the CAKE. `@orb/ui`
// `content/theme-scope/clamp.ts` emits the CSS that USES these numbers (via relative-colour syntax, so the
// browser does the arithmetic); `@orb/server` `domain/import` must PREDICT the same arithmetic in node, to
// decide whether a foreign palette can be converted into an orb theme SAFELY — a colour whose derived pair
// would not clear WCAG AA is not importable, it is unmappable. ui and server cannot import each other, and
// neither may own a number the other must agree with, so the numbers live below both.
//
// WHAT THE DERIVATION IS (clamp.ts owns the CSS spelling; this file owns the meaning):
//   • a FOREGROUND is never picked, only derived — its lightness flips light↔dark around `fgPivotL` with a
//     steep step, so any surface lighter than the pivot gets near-black text and darker gets near-white;
//   • the neutral surface RAMP is the base with only L shifted (hue + chroma held);
//   • `color-scheme` derives from the base's L against the SAME pivot, so text polarity and scheme polarity
//     can never disagree.
//
// THE PIVOT MID-BAND IS THE SAFETY GATE. Because the flip is a step function through `fgPivotL`, a base
// surface sitting NEAR the pivot derives a foreground that is neither near-black nor near-white, and the pair
// is inherently low-contrast. `tests/ui/content/theme-scope/palette-contrast.suite.test.ts` documents this
// explicitly and deliberately sweeps only bases OUTSIDE the band ("a mid-gray page surface is inherently
// low-contrast for any sub-maximal tone, and no real palette uses one"). A hand-authored orb palette never
// lands there; a FOREIGN palette can, which is exactly why the importer needs to ask.
// The band is MEASURED, not declared: `isDerivableBaseSurface` runs the real pairings, and the boundary that
// falls out is L ∈ [0.45, 0.63] (pinned in this module's test). That suite's "~0.28–0.62" is a deliberately
// generous exclusion range for a sweep — a prose approximation, not the boundary — so nothing here derives
// from it.

/** The numeric derivation constants — the ONE declaration. `@orb/ui`'s clamp re-exports these as
 *  `THEME_DERIVATION` (its own consumers' name) and spells them into CSS; nothing re-derives them. */
export const THEME_DERIVATION = {
  fgPivotL: 0.62,
  fgSteepness: 1000,
  fgLMin: 0.22,
  fgLMax: 0.96,
  mutedLMin: 0.34,
  mutedLMax: 0.82,
  borderAlpha: 0.14,
  inputAlpha: 0.12,
  ramp: {
    sidebar: -0.026,
    surfaceRaised: 0.027,
    card: 0.047,
    popover: 0.087,
    accent: 0.127,
    sidebarAccent: 0.077,
    secondary: 0.097,
    muted: 0.097,
  },
} as const;

/** WCAG AA for normal-size text — the floor `palette-contrast.suite.test.ts` holds every orb pairing to. */
export const AA_NORMAL_RATIO = 4.5;
/** @public WCAG AA for large text / non-text UI — the floor's sibling threshold beside `AA_NORMAL_RATIO`;
 *  the theme importer gates on normal-size only today, this is the named constant the next gate reaches for. */
export const AA_LARGE_RATIO = 3;

/** An sRGB triple, channels 0–255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** An OKLCH colour: lightness 0–1, chroma, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const SRGB_MAX = 255;
const GAMMA_LINEAR_THRESHOLD = 0.003_130_8;
const GAMMA_LINEAR_SLOPE = 12.92;
const GAMMA_SCALE = 1.055;
const GAMMA_OFFSET = 0.055;
const GAMMA_EXPONENT = 2.4;
// The WCAG sRGB linearization threshold (0.03928). Written WITH separators rather than suppressed — a new
// suppression would have to buy budget off the repo-wide ratchet, and the digits stay legible either way.
const WCAG_LINEAR_THRESHOLD = 0.039_28;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
const CONTRAST_OFFSET = 0.05;
const HALF_TURN_DEGREES = 180;
const DEGREES_PER_RADIAN = HALF_TURN_DEGREES / Math.PI;
const CUBE = 3;

// Ottosson's OKLab→LMS' matrix.
const LMS_L_A = 0.396_337_777_4;
const LMS_L_B = 0.215_803_757_3;
const LMS_M_A = 0.105_561_345_8;
const LMS_M_B = 0.063_854_172_8;
const LMS_S_A = 0.089_484_177_5;
const LMS_S_B = 1.291_485_548;
// Ottosson's LMS→linear-sRGB matrix.
const RGB_R_L = 4.076_741_662_1;
const RGB_R_M = 3.307_711_591_3;
const RGB_R_S = 0.230_969_929_2;
const RGB_G_L = 1.268_438_004_6;
const RGB_G_M = 2.609_757_401_1;
const RGB_G_S = 0.341_319_396_5;
const RGB_B_L = 0.004_196_086_3;
const RGB_B_M = 0.703_418_614_7;
const RGB_B_S = 1.707_614_701;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gammaEncode(linear: number): number {
  const c = clamp01(linear);
  return (c <= GAMMA_LINEAR_THRESHOLD ? GAMMA_LINEAR_SLOPE * c : GAMMA_SCALE * c ** (1 / GAMMA_EXPONENT) - GAMMA_OFFSET) * SRGB_MAX;
}

/** OKLCH → sRGB (0–255), gamut-clamped. The inverse of the importer's sRGB→OKLCH, and the same house math
 *  `palette-contrast.suite.test.ts` uses to measure a derived tone. */
export function oklchToSrgb({ l, c, h }: Oklch): Rgb {
  const radians = h / DEGREES_PER_RADIAN;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lRoot = (l + LMS_L_A * a + LMS_L_B * b) ** CUBE;
  const mRoot = (l - LMS_M_A * a - LMS_M_B * b) ** CUBE;
  const sRoot = (l - LMS_S_A * a - LMS_S_B * b) ** CUBE;
  return {
    r: gammaEncode(RGB_R_L * lRoot - RGB_R_M * mRoot + RGB_R_S * sRoot),
    g: gammaEncode(-RGB_G_L * lRoot + RGB_G_M * mRoot - RGB_G_S * sRoot),
    b: gammaEncode(-RGB_B_L * lRoot - RGB_B_M * mRoot + RGB_B_S * sRoot),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number): number => {
    const c = Math.max(0, Math.min(SRGB_MAX, raw)) / SRGB_MAX;
    return c <= WCAG_LINEAR_THRESHOLD ? c / GAMMA_LINEAR_SLOPE : ((c + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT;
  };
  return LUMA_R * channel(r) + LUMA_G * channel(g) + LUMA_B * channel(b);
}

/** The WCAG contrast ratio (1–21) between two OPAQUE sRGB colours. Composite any alpha before calling. */
export function wcagContrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + CONTRAST_OFFSET) / (Math.min(la, lb) + CONTRAST_OFFSET);
}

/** The LIGHTNESS orb derives for text sitting on a surface of lightness `surfaceL` — the steep pivot flip
 *  clamp.ts spells as `clamp(fgLMin, (fgPivotL - l) * fgSteepness, fgLMax)`. */
export function derivedForegroundLightness(surfaceL: number): number {
  const D = THEME_DERIVATION;
  return Math.max(D.fgLMin, Math.min(D.fgLMax, (D.fgPivotL - surfaceL) * D.fgSteepness));
}

/** The foreground orb WOULD derive for `surface` — chroma 0 at the surface's own hue, exactly as
 *  `foregroundOn()` emits `oklch(from <surface> <CONTRAST_L> 0 h)`. */
export function derivedForeground(surface: Oklch): Oklch {
  return { l: derivedForegroundLightness(surface.l), c: 0, h: surface.h };
}

/** One neutral ramp surface: the base with only L shifted (hue + chroma held), as the clamp emits. */
export function rampSurface(base: Oklch, deltaL: number): Oklch {
  return { l: clamp01(base.l + deltaL), c: base.c, h: base.h };
}

/**
 * Can orb DERIVE an acceptable palette from this base surface? False inside the pivot mid-band, where the
 * step flip produces a mid-tone foreground and the pair is inherently low-contrast (see the module header).
 * Measured, not asserted: it derives the foreground for the base AND for every ramp surface a plain derived
 * foreground is painted on, and requires each pairing to clear AA-NORMAL — the exact property the
 * `palette-contrast` suite enforces for orb's own palettes.
 */
export function isDerivableBaseSurface(base: Oklch): boolean {
  const foreground = oklchToSrgb(derivedForeground(base));
  const surfaces = [
    base,
    rampSurface(base, THEME_DERIVATION.ramp.card),
    rampSurface(base, THEME_DERIVATION.ramp.popover),
    rampSurface(base, THEME_DERIVATION.ramp.sidebar),
    rampSurface(base, THEME_DERIVATION.ramp.secondary),
    rampSurface(base, THEME_DERIVATION.ramp.sidebarAccent),
  ];
  return surfaces.every((surface) => wcagContrastRatio(foreground, oklchToSrgb(surface)) >= AA_NORMAL_RATIO);
}
