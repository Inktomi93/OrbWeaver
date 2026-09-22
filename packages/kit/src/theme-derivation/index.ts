// The D71 theme-DERIVATION numbers and the pure colour math that reasons about them — the ONE home.
//
// Kit-homed for the same reason `safe-color` is: its consumers span the CAKE. `@orb/ui`
// `content/theme-scope/clamp.ts` emits the CSS that USES these numbers (via relative-colour syntax, so the
// browser does the arithmetic); `@orb/server` imports foreign palettes into the same ThemeOverride contract.
// ui and server cannot import each other, so the total derivation and colour math live below both.
//
// WHAT THE DERIVATION IS (clamp.ts owns the CSS spelling; this file owns the meaning):
//   • a FOREGROUND is never picked, only derived — polarity comes from whichever of black/white has more
//     contrast against the actual gamut-mapped surface, then the existing endpoint moves in 0.001-L steps
//     toward that extreme until both float and quantized pixels clear WCAG AA;
//   • the neutral surface RAMP is the base with only L shifted (hue + chroma held) — by a delta from the
//     TWO-ARM `ramp` block, selected by the same measured polarity (#682): a dark base's chrome rises off it, a
//     light base's recedes, because above L ≈ 0.95 "lighter" has no headroom left and the whole family
//     collapses into one white;
//   • `color-scheme`, ramps, elevation, charts and reading plates derive from that SAME measured polarity,
//     so native controls and generated colors cannot disagree with the ink direction.
//
// ACCEPTED BASES ARE TOTAL. There is no refused lightness band: each semantic ink is judged against the
// surface it actually paints. A shared token is allowed only for a documented family that one ink can cover;
// distinct surfaces own distinct foreground roles (including sidebar accent and the over-art reading plate).

/** The numeric derivation constants — the ONE declaration. `@orb/ui`'s clamp re-exports these as
 *  `THEME_DERIVATION` (its own consumers' name) and spells them into CSS; nothing re-derives them.
 *
 *  `readingPlate` is the transcript's over-art text backing (`--color-reading-plate`, #204): the base
 *  surface with only L shifted (like the ramp) but CARRYING ITS OWN ALPHA, because the plate composites
 *  over wallpaper art. It is NOT the backdrop dimmer (`--color-backdrop`, polarity-FIXED smoke): a
 *  reading plate must follow the palette's polarity so the palette's own inks land on their own surface
 *  — the #204 root cause was one `--color-scrim` token serving both jobs. `deltaL` −0.038 reproduces the
 *  retired scrim's dark value off the Hearth base to the digit (0.158 − 0.038 = 0.120); `alpha` 0.65 is
 *  the MEASURED floor (live A/B 2026-08-18: 0.65 turned the failing carried-light room's dialogue
 *  1.32→6.79 and body 1.14→14.33 while the dark-art room stayed 12.06/13.60 and visually identical),
 *  pinned by the plate-floor proof in `palette-contrast.suite.test.ts`. `alpha` is the FLOOR the
 *  polarity-aware {@link readingPlateAlpha} starts from, no longer the emitted value for every palette
 *  (#217 — read that function's contract for the algebra and for `inkReferenceRatio`).
 *
 *  The plate's OPAQUE sibling — the sticky attribution BAND — is {@link readingBandSurface}: the same
 *  `deltaL` off the same base, at {@link READING_BAND_ALPHA}. It carries no alpha of its own to declare
 *  here precisely because it is the plate at α 1 (#241).
 *
 *  `shadow` is the two-armed ELEVATION recipe {@link shadowIngredients} selects between — the five
 *  `--color-shadow-*` ingredients `--shadow-overlay` / `--shadow-cta` are built from (#232/#243). Neither
 *  arm is invented: `dark` is the base `@theme` recipe digit-for-digit and `light` is the Light seed's
 *  own measured block, promoted from a hand-authored per-seed value into the derivation a CUSTOM theme
 *  gets too. The two arms are what an elevation IS on each polarity: on a dark surface the ring and the
 *  inset are light-from-above (white alpha) and the drop is near-black; on a light surface a white ring
 *  is a 1.00:1 ghost, the inset paints nothing at all (α 0), and a near-black drop reads as a torn-out
 *  sticker — so the ring inverts to a dark hairline and the drop lifts to L 0.35 at a third of the alpha.
 *  Only `l`/`c`/`alpha` live here: the HUE is the palette's own (see the function).
 *
 *  `ramp` is the neutral SURFACE ramp, and it is two-armed for the same reason and measured polarity
 *  (#682, the #243 move applied to the surfaces): the arms are lightness DELTAS off the picked base that
 *  {@link rampDeltas} selects between. Neither arm is invented — `dark` is the pre-#682 single additive
 *  block digit-for-digit, and `light` is the shipped Light seed's own measured block promoted from a
 *  hand-authored per-seed value-set into the derivation a CUSTOM theme gets too (base 0.98 → sidebar
 *  0.955, surface-raised 0.965, card/popover 0.995, secondary 0.94, muted 0.95, accent 0.93,
 *  sidebar-accent 0.90). A single additive block cannot serve both polarities: on a near-white base every
 *  positive member saturates at L 1.0, so card = popover = secondary = muted = accent = sidebar-accent =
 *  white and `muted`-on-`card` renders at 1.0000:1 — the arc meter's track, a card skeleton and a track
 *  bar all disappear. On a light surface a raised tone is not a lighter one (there is no headroom); it is
 *  a RECESSED one, which is exactly what the Light seed always spelled by hand. */
export const THEME_DERIVATION = {
  fgLMin: 0.22,
  fgLMax: 0.96,
  mutedLMin: 0.34,
  mutedLMax: 0.82,
  borderAlpha: 0.14,
  inputAlpha: 0.12,
  readingPlate: { deltaL: -0.038, alpha: 0.65, inkReferenceRatio: 6 },
  shadow: {
    dark: {
      hairline: { l: 1, c: 0, alpha: 0.06 },
      highlight: { l: 1, c: 0, alpha: 0.08 },
      ambientNear: { l: 0, c: 0, alpha: 0.4 },
      ambientFar: { l: 0, c: 0, alpha: 0.5 },
      ctaHighlight: { l: 1, c: 0, alpha: 0.15 },
    },
    light: {
      hairline: { l: 0.2, c: 0.01, alpha: 0.14 },
      highlight: { l: 1, c: 0, alpha: 0 },
      ambientNear: { l: 0.35, c: 0.02, alpha: 0.1 },
      ambientFar: { l: 0.35, c: 0.02, alpha: 0.14 },
      ctaHighlight: { l: 1, c: 0, alpha: 0.22 },
    },
  },
  ramp: {
    dark: {
      sidebar: -0.026,
      surfaceRaised: 0.027,
      card: 0.047,
      popover: 0.087,
      accent: 0.127,
      sidebarAccent: 0.077,
      secondary: 0.097,
      muted: 0.097,
    },
    light: {
      sidebar: -0.025,
      surfaceRaised: -0.015,
      card: 0.015,
      popover: 0.015,
      accent: -0.05,
      sidebarAccent: -0.08,
      secondary: -0.04,
      muted: -0.03,
    },
  },
} as const;

/** WCAG AA for normal-size text — the floor `palette-contrast.suite.test.ts` holds every orb pairing to. */
export const AA_NORMAL_RATIO = 4.5;
/** Orb's authored-neutral-ink target. It is deliberately above the legal floor because the browser's
 *  8-bit OKLCH resolution and alpha composition can spend contrast after the analytic solve. A host near
 *  WCAG's black/white crossover cannot physically reach 4.6, so each search caps this aim at the chosen
 *  polarity endpoint's measured capacity rather than narrowing the accepted theme domain. */
export const AA_NORMAL_DERIVATION_RATIO = 4.6;
/** WCAG AA for large text and non-text graphics. The chart-ramp and accent-fill solvers use this live 3:1
 *  floor, and the theme-derivation suite pins both families against it. */
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

// Ottosson's linear-sRGB→LMS matrix (the inverse direction of the pair above; INV_-prefixed because
// the forward pair already owns the bare LMS_* names).
const INV_LMS_L_R = 0.412_221_470_8;
const INV_LMS_L_G = 0.536_332_536_3;
const INV_LMS_L_B = 0.051_445_992_9;
const INV_LMS_M_R = 0.211_903_498_2;
const INV_LMS_M_G = 0.680_699_545_1;
const INV_LMS_M_B = 0.107_396_956_6;
const INV_LMS_S_R = 0.088_302_461_9;
const INV_LMS_S_G = 0.281_718_837_6;
const INV_LMS_S_B = 0.629_978_700_5;
// Ottosson's LMS'→OKLab matrix.
const LAB_L_L = 0.210_454_255_3;
const LAB_L_M = 0.793_617_785;
const LAB_L_S = 0.004_072_046_8;
const LAB_A_L = 1.977_998_495_1;
const LAB_A_M = 2.428_592_205;
const LAB_A_S = 0.450_593_709_9;
const LAB_B_L = 0.025_904_037_1;
const LAB_B_M = 0.782_771_766_2;
const LAB_B_S = 0.808_675_766;
// The standard sRGB EOTF threshold (Ottosson's reference uses 0.04045; the WCAG 0.03928 above is the
// legacy luminance spelling — the two constants serve different formulas and must not be merged).
const SRGB_EOTF_THRESHOLD = 0.040_45;
const HUE_WHEEL_DEGREES = 360;

function srgbLinear(channel: number): number {
  const c = Math.max(0, Math.min(SRGB_MAX, channel)) / SRGB_MAX;
  return c <= SRGB_EOTF_THRESHOLD ? c / GAMMA_LINEAR_SLOPE : ((c + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT;
}

/** sRGB (0–255) → OKLCH — the exact inverse of {@link oklchToSrgb} (#204: lets the prose-ink clamp and
 *  the polarity derivation judge a hex/rgb()/hsl() authored value instead of failing open on format). */
export function srgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = srgbLinear(r);
  const lg = srgbLinear(g);
  const lb = srgbLinear(b);
  const l = Math.cbrt(INV_LMS_L_R * lr + INV_LMS_L_G * lg + INV_LMS_L_B * lb);
  const m = Math.cbrt(INV_LMS_M_R * lr + INV_LMS_M_G * lg + INV_LMS_M_B * lb);
  const s = Math.cbrt(INV_LMS_S_R * lr + INV_LMS_S_G * lg + INV_LMS_S_B * lb);
  const okL = LAB_L_L * l + LAB_L_M * m - LAB_L_S * s;
  const okA = LAB_A_L * l - LAB_A_M * m + LAB_A_S * s;
  const okB = LAB_B_L * l + LAB_B_M * m - LAB_B_S * s;
  const chroma = Math.hypot(okA, okB);
  const hue = (((Math.atan2(okB, okA) * DEGREES_PER_RADIAN) % HUE_WHEEL_DEGREES) + HUE_WHEEL_DEGREES) % HUE_WHEEL_DEGREES;
  return { l: okL, c: chroma, h: hue };
}

/** OKLab (the rectangular form: L + the a/b axes) → OKLCH (the polar form the derivation reasons in) —
 *  the same L, chroma as the a/b magnitude, hue as their angle. Kit-homed beside `srgbToOklch` because it
 *  is the other "authored colour → judgeable OKLCH" conversion: `oklab()` is an `isSafeColor`-legal
 *  spelling, so the prose-ink clamp reads it rather than failing open on format (#204 / stickler F4). */
export function oklabToOklch(l: number, a: number, b: number): Oklch {
  const hue = (((Math.atan2(b, a) * DEGREES_PER_RADIAN) % HUE_WHEEL_DEGREES) + HUE_WHEEL_DEGREES) % HUE_WHEEL_DEGREES;
  return { l, c: Math.hypot(a, b), h: hue };
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

/** Alpha-composite a translucent sRGB colour over an opaque one (non-linear sRGB space — the same
 *  space the browser composites in by default). Shared by the reading-plate floor proof (plate over
 *  worst-case art) and the prose-ink clamp (a translucent authored ink over the base surface). */
export function compositeSrgb(top: Rgb, alpha: number, under: Rgb): Rgb {
  const a = clamp01(alpha);
  return {
    r: a * top.r + (1 - a) * under.r,
    g: a * top.g + (1 - a) * under.g,
    b: a * top.b + (1 - a) * under.b,
  };
}

/**
 * The #204 §7a prose-ink clamp decision — for the four AUTHOR-PICKED transcript inks
 * (`speaker`/`dialogueColor`/`narrationColor`/`bodyColor`), the only inks exempt from the house
 * "a foreground is never picked, only derived" law. Judged against the theme's own BASE surface
 * (post-#204 every reading plate derives from that one base, so base-legibility is plate-legibility):
 *   • `null`  — the authored ink already clears AA against the base: keep it BYTE-IDENTICAL
 *     (the no-op-where-the-card-was-sensible guarantee; the dark-art rooms do not move a pixel);
 *   • a number — the ink fails AA there: the LIGHTNESS to re-derive it at, keeping the author's hue and
 *     chroma and using the same measured polarity/render-target solver as every derived foreground.
 * `inkAlpha < 1` composites the ink over the base first — a naive ratio on a translucent ink lies. (The
 * comparison stays INSIDE the backticks: tsdoc reads a bare `<` followed by a space as a malformed HTML
 * element and the eslint tsdoc/syntax rule reds the file.)
 */
export function proseInkLightness(ink: Oklch, inkAlpha: number, base: Oklch): number | null {
  const baseRgb = oklchToSrgb(base);
  const inkRgb = inkAlpha < 1 ? compositeSrgb(oklchToSrgb(ink), inkAlpha, baseRgb) : oklchToSrgb(ink);
  if (wcagContrastRatio(inkRgb, baseRgb) >= AA_NORMAL_RATIO) {
    return null;
  }
  return derivedForegroundLightness(base);
}

export type SurfacePolarity = "dark" | "light";

const FOREGROUND_L_STEP = 0.001;
const FOREGROUND_L_DECIMALS = 3;

function quantized({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function worstTextContrast(ink: Rgb, surfaces: readonly Rgb[]): number {
  return Math.min(...surfaces.flatMap((surface) => [wcagContrastRatio(ink, surface), wcagContrastRatio(quantized(ink), quantized(surface))]));
}

function neutralInkTarget(polarity: SurfacePolarity, anchor: Rgb): number {
  const endpoint = oklchToSrgb({ l: polarity === "light" ? 0 : 1, c: 0, h: 0 });
  return Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstTextContrast(endpoint, [anchor])));
}

function tryNeutralInkLightness(polarity: SurfacePolarity, surfaces: readonly Rgb[], initial: number, target: number): number | null {
  const increment = polarity === "light" ? -FOREGROUND_L_STEP : FOREGROUND_L_STEP;
  const limit = polarity === "light" ? 0 : 1;
  const clears = (l: number): boolean => worstTextContrast(oklchToSrgb({ l, c: 0, h: 0 }), surfaces) >= target;
  if (clears(initial)) {
    return initial;
  }
  const steps = Math.round(Math.abs(limit - initial) / FOREGROUND_L_STEP);
  if (!clears(limit)) {
    return null;
  }
  let low = 1;
  let high = steps;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = Math.round((initial + increment * middle) / FOREGROUND_L_STEP) * FOREGROUND_L_STEP;
    if (clears(candidate)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return Math.round((initial + increment * low) / FOREGROUND_L_STEP) * FOREGROUND_L_STEP;
}

function neutralInkLightness(polarity: SurfacePolarity, surfaces: readonly Rgb[], initial: number, target: number): number {
  const lightness = tryNeutralInkLightness(polarity, surfaces, initial, target);
  if (lightness === null) {
    throw new Error("unable to derive a contrast-safe neutral foreground");
  }
  return lightness;
}

/** Whether a surface is light or dark, decided from the stronger of Orb's existing dark/light ink
 * endpoints against the actual gamut-mapped pixel. This is the single polarity decision for foregrounds,
 * ramp/elevation arms, native `color-scheme`, chart preference, and plate alpha. */
export function surfacePolarity(surface: Oklch): SurfacePolarity {
  const surfaceRgb = oklchToSrgb(surface);
  const dark = worstTextContrast(oklchToSrgb({ l: 0, c: 0, h: surface.h }), [surfaceRgb]);
  const light = worstTextContrast(oklchToSrgb({ l: 1, c: 0, h: surface.h }), [surfaceRgb]);
  return dark >= light ? "light" : "dark";
}

/** The smallest movement from Orb's existing foreground endpoint that reaches the attainable render target
 * against `surface`. Existing dark/light themes keep their endpoint exactly; pivot-adjacent surfaces
 * continue toward black/white in deterministic 0.001-L steps until float and quantized colors clear. */
export function derivedForegroundLightness(surface: Oklch): number {
  const polarity = surfacePolarity(surface);
  const initial = polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax;
  const surfaceRgb = oklchToSrgb(surface);
  return neutralInkLightness(polarity, [surfaceRgb], initial, neutralInkTarget(polarity, surfaceRgb));
}

/** A shared foreground for a documented family of nearby hosts (background/card/raised). */
export function derivedForegroundLightnessForSurfaces(surfaces: readonly Oklch[]): number {
  const anchor = surfaces[0];
  if (anchor === undefined) {
    throw new Error("foreground requires at least one surface");
  }
  const polarity = surfacePolarity(anchor);
  const initial = polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax;
  const anchorRgb = oklchToSrgb(anchor);
  return neutralInkLightness(
    polarity,
    surfaces.map((surface) => oklchToSrgb(surface)),
    initial,
    neutralInkTarget(polarity, anchorRgb),
  );
}

/** One global low-emphasis ink judged against the actual neutral hosts it is documented to paint on.
 * It stays in the softer band where that band clears and firms toward black/white only when necessary. */
export function derivedMutedForegroundLightness(surfaces: readonly Oklch[]): number {
  const anchor = surfaces[0];
  if (anchor === undefined) {
    throw new Error("muted foreground requires at least one surface");
  }
  const polarity = surfacePolarity(anchor);
  const initial = polarity === "light" ? THEME_DERIVATION.mutedLMin : THEME_DERIVATION.mutedLMax;
  const anchorRgb = oklchToSrgb(anchor);
  return neutralInkLightness(
    polarity,
    surfaces.map((surface) => oklchToSrgb(surface)),
    initial,
    neutralInkTarget(polarity, anchorRgb),
  );
}

/** The foreground orb WOULD derive for `surface` — chroma 0 at the surface's own hue, exactly as
 *  `foregroundOn()` emits `oklch(from <surface> <CONTRAST_L> 0 h)`. */
export function derivedForeground(surface: Oklch): Oklch {
  return { l: derivedForegroundLightness(surface), c: 0, h: surface.h };
}

/** One neutral ramp surface: the base with only L shifted (hue + chroma held), as the clamp emits. */
export function rampSurface(base: Oklch, deltaL: number): Oklch {
  return { l: clamp01(base.l + deltaL), c: base.c, h: base.h };
}

/** The opaque pixel painted by the translucent input fill over one of its actual backing surfaces. */
export function inputCompositeSurface(base: Oklch, backing: Oklch, alpha: number = THEME_DERIVATION.inputAlpha): Oklch {
  const inputInk = { l: derivedForegroundLightness(base), c: 0, h: base.h };
  return srgbToOklch(compositeSrgb(oklchToSrgb(inputInk), alpha, oklchToSrgb(backing)));
}

export interface MutedForegroundPair {
  readonly lightness: number;
  readonly inputAlpha: number;
}

/** The shared low-emphasis ink plus the translucent input alpha it must clear. The authored base stays
 * fixed; derived ramp projection happens upstream, and only the fill alpha steps toward transparent when
 * its legacy 0.12 would pull an input below the anchor's attainable render target. */
export function derivedMutedForegroundPair(base: Oklch, opaqueSurfaces: readonly Oklch[], inputBackings: readonly Oklch[]): MutedForegroundPair {
  const polarity = surfacePolarity(base);
  const initial = polarity === "light" ? THEME_DERIVATION.mutedLMin : THEME_DERIVATION.mutedLMax;
  const target = neutralInkTarget(polarity, oklchToSrgb(base));
  const alphaSteps = Math.round(THEME_DERIVATION.inputAlpha / FOREGROUND_L_STEP);
  const inputInk = oklchToSrgb({ l: derivedForegroundLightness(base), c: 0, h: base.h });
  for (let step = alphaSteps; step >= 0; step -= 1) {
    const inputAlpha = Number((step * FOREGROUND_L_STEP).toFixed(FOREGROUND_L_DECIMALS));
    const surfaces = [
      ...opaqueSurfaces.map((surface) => oklchToSrgb(surface)),
      ...inputBackings.map((backing) => compositeSrgb(inputInk, inputAlpha, oklchToSrgb(backing))),
    ];
    const lightness = tryNeutralInkLightness(polarity, surfaces, initial, target);
    if (lightness !== null) {
      return { lightness, inputAlpha };
    }
  }
  throw new Error("unable to derive a contrast-safe muted/input pair");
}

/** The sRGB grey whose WCAG relative luminance is `target` — the inverse of {@link relativeLuminance} for a
 *  neutral (the three luma weights sum to 1, so a grey's luminance IS its linear channel value). Spelled
 *  against the WCAG transfer function, not the sRGB one, so it round-trips this file's own luminance. */
function greyWithLuminance(target: number): Rgb {
  const linear = clamp01(target);
  const encoded =
    linear <= WCAG_LINEAR_THRESHOLD / GAMMA_LINEAR_SLOPE ? linear * GAMMA_LINEAR_SLOPE : GAMMA_SCALE * linear ** (1 / GAMMA_EXPONENT) - GAMMA_OFFSET;
  const channel = clamp01(encoded) * SRGB_MAX;
  return { r: channel, g: channel, b: channel };
}

/** The alpha grid the emitted plate snaps to — three decimals, the precision a CSS alpha slot needs. */
const PLATE_ALPHA_STEP = 0.001;
const PLATE_ALPHA_DECIMALS = 3;
const PLATE_ALPHA_STEPS = Math.round((1 - THEME_DERIVATION.readingPlate.alpha) / PLATE_ALPHA_STEP);

/**
 * THE READING PLATE'S ALPHA for a base surface — polarity-aware, derived, never designed (#217).
 *
 * WHY IT CANNOT BE ONE NUMBER. The plate is translucent, so the surface the transcript's ink actually
 * lands on is `plate·α + art·(1−α)` — the ART is in the composite, and art is arbitrary.
 *
 * THIS DERIVATION KEEPS RAW ART AS ITS INPUT, DELIBERATELY, EVEN THOUGH RAW ART IS NO LONGER LEGAL (#487).
 * The sentence here used to read "`BACKGROUND_DIM_MIN` is 0, so raw pixels are legal"; that premise died
 * when the wallpaper scrim grew a derived floor of 0.45. Re-solving the alpha against SCRIMMED art would
 * relax it — and relaxing a shipped plate alpha moves pixels in every light room for no legibility gain.
 * Raw art is therefore retained as a strictly-conservative input: the scrim floor is an ADDITIONAL
 * guarantee stacked under this one, never a reason to weaken it. Which art is the WORST case is a function of the
 * plate's POLARITY, and the intuition runs backwards: a LIGHT plate carries DARK inks, so the composite
 * is worst when the art DARKENS it ⇒ BLACK art; a DARK plate carries LIGHT inks ⇒ WHITE art. Measured
 * live 2026-08-18 (the chats rescoring pass): at the flat 0.65 the light-palette
 * done-bar room read narration 3.48:1 / dialogue 4.09:1 over the bright wallpaper regions and 4.94/5.39
 * over the dark ones — the same ink, the same alpha, the scroll position deciding the verdict.
 *
 * THE REFERENCE INK, and why it is not AA itself. The §7a clamp (`proseInkLightness`) guarantees an ink
 * clears AA_NORMAL against the BASE. That floor is unreachable on the plate at ANY alpha: the plate is
 * `deltaL` darker than the base, so even at α = 1 an ink sitting exactly on 4.5 vs the base measures
 * ~4.1 vs the plate — preserving the base guarantee would need `deltaL` to move to 0, i.e. the plate to
 * BE the base, which deletes the token. The achievable floor is
 * `4.5 × (baseLuminance + 0.05) / (plateLuminance + 0.05)`
 * — measured 5.04–5.25 across the realistic light bases — so the derivation
 * must name a reference ABOVE it. It protects `inkReferenceRatio` (6:1 vs the base) — OWNER-RULED
 * 2026-08-18 off the table below, the knob being a legibility-vs-art trade nobody else may set: the
 * legibility of the LEAST legible ink orb SHIPS (the light palette's speaker, 6.02:1), pinned by
 * `palette-contrast.suite.test.ts` so the reference cannot rot away from the shipped palettes. The
 * alphas that buys, and their cost in art: ref 6 → α 0.921 · ref 5.5 → 0.960 · ref 5.2 → 0.985 ·
 * ref 5.0 → 1 (an opaque plate, no window at all).
 *
 * THE STATED RESIDUAL: an ink between AA_NORMAL and `inkReferenceRatio` against its own base is legible
 * on the plate over ordinary art and is NOT guaranteed over the worst legal art. It is a real case, not
 * a hypothetical — the owner's own done-bar card (harvested live 2026-08-18: base `oklch(0.98 0.004 78)`,
 * speaker `oklch(0.53 0.14 58)` = 5.20:1) sits there, and reads 3.90 over the plate over pure black
 * while measuring 5.51 in the room. Its three FILED inks are the ones this closes: dialogue 3.38→6.81,
 * narration 2.98→6.01, prose-body 5.15→10.37. Moving the residual is a `deltaL` question, not an alpha
 * one — an owner fork, not a retune.
 *
 * THE DARK ARM KEEPS THE MEASURED FLOOR, and that is an owner ruling, not an oversight. D144(d): "Inks
 * are guaranteed vs their BASE, not worst-case art pixels — closing that would move the sacred dark
 * rooms (owner-adjacent, refused)", restated by #217 as the fix's hard constraint. The dark plates carry
 * the same defect over BRIGHT art (measured at 0.65: hearth speaker 2.51, mocha speaker 2.50) and
 * closing it needs α 0.86 — exactly the sacred-room move that was refused. So a dark base returns the
 * floor unchanged and the dark rooms do not move a pixel BY CONSTRUCTION.
 *
 * Returns a 3-decimal alpha in `[readingPlate.alpha, 1]`: the smallest one at which the reference ink
 * clears AA_NORMAL over the plate composited on the worst legal art. No art is ever sampled (#106).
 */
function referencePlateAlpha(base: Oklch, plate: Rgb): number {
  const plateAlphaFloor = THEME_DERIVATION.readingPlate.alpha;
  if (surfacePolarity(base) === "dark") {
    return plateAlphaFloor;
  }
  const baseLuminance = relativeLuminance(oklchToSrgb(base));
  // A light base ⇒ the reference ink is the DARK one `inkReferenceRatio` below it, and the worst art is
  // black. (The dark arm returned above; it would mirror both.)
  const referenceInk = greyWithLuminance((baseLuminance + CONTRAST_OFFSET) / THEME_DERIVATION.readingPlate.inkReferenceRatio - CONTRAST_OFFSET);
  const worstArt: Rgb = { r: 0, g: 0, b: 0 };
  for (let step = 0; step < PLATE_ALPHA_STEPS; step += 1) {
    const alpha = plateAlphaFloor + step * PLATE_ALPHA_STEP;
    if (worstTextContrast(referenceInk, [compositeSrgb(plate, alpha, worstArt)]) >= AA_NORMAL_RATIO) {
      // Re-round: 0.65 + n×0.001 accumulates binary-float dust that would reach the CSS literal.
      return Number((Math.round(alpha / PLATE_ALPHA_STEP) * PLATE_ALPHA_STEP).toFixed(PLATE_ALPHA_DECIMALS));
    }
  }
  return 1;
}

interface ReadingPlatePair {
  readonly alpha: number;
  readonly foreground: Oklch;
}

function readingPlatePair(base: Oklch): ReadingPlatePair {
  const plateSurface = rampSurface(base, THEME_DERIVATION.readingPlate.deltaL);
  const plate = oklchToSrgb(plateSurface);
  const startAlpha = referencePlateAlpha(base, plate);
  const polarity = surfacePolarity(plateSurface);
  const initial = polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax;
  const target = neutralInkTarget(polarity, plate);
  const steps = Math.round((1 - startAlpha) / PLATE_ALPHA_STEP);
  for (let step = 0; step <= steps; step += 1) {
    const alpha = Number((Math.round((startAlpha + step * PLATE_ALPHA_STEP) / PLATE_ALPHA_STEP) * PLATE_ALPHA_STEP).toFixed(PLATE_ALPHA_DECIMALS));
    const surfaces = [compositeSrgb(plate, alpha, { r: 0, g: 0, b: 0 }), compositeSrgb(plate, alpha, { r: 255, g: 255, b: 255 })];
    const lightness = tryNeutralInkLightness(polarity, surfaces, initial, target);
    if (lightness !== null) {
      return { alpha, foreground: { l: lightness, c: 0, h: base.h } };
    }
  }
  throw new Error("unable to derive a contrast-safe reading plate pair");
}

export function readingPlateAlpha(base: Oklch): number {
  return readingPlatePair(base).alpha;
}

/** The neutral ink paired with the translucent reading plate and its opaque reading-band sibling.
 * The judge is the actual plate composite over both black and white art at the derived alpha. A base
 * foreground is not this pairing: around the old pivot it can clear the base while failing the plate. */
export function readingPlateForeground(base: Oklch): Oklch {
  return readingPlatePair(base).foreground;
}

/**
 * THE STICKY ATTRIBUTION BAND'S ALPHA — opaque, and that is an OWNER RULING, not a tuning (#168,
 * re-stated as the hard constraint of #241's ruling). A pinned band that lets the prose it is pinned
 * over show through does not own its slice; the band is the one over-prose backing in the transcript
 * that must OCCLUDE. Named rather than inlined because relative-colour syntax DEFAULTS the omitted
 * alpha slot to the ORIGIN's — deriving the band off a translucent plate without spelling `/ 1` would
 * silently reproduce the translucency this constant exists to refuse (the same fixed-point that bit the
 * §7a ink clamp, stickler F1).
 */
export const READING_BAND_ALPHA = 1;

/**
 * THE STICKY ATTRIBUTION BAND'S COLOUR for a base surface — the reading plate's colour, at
 * {@link READING_BAND_ALPHA} (#241, owner-ruled off #223).
 *
 * WHY IT IS THE PLATE AND NOT A RAMP MEMBER. The band shipped as the `card` ramp surface
 * (`base + ramp.dark.card`, +0.047) while the prose under it rides the plate (`base + readingPlate.deltaL`,
 * −0.038): two backings on ONE column, a constant ΔL ≈ 0.085 apart, which the owner filed as an
 * unintentional-looking step ("two stacked whites of different opacity per message"). Deriving the band
 * FROM the plate makes the step disappear BY CONSTRUCTION rather than by matching two numbers that can
 * drift apart again — the same one-home move D144(b) made for the plate itself. There is no separate
 * `deltaL` to tune here on purpose: a band that is anything other than the plate at α 1 is the defect.
 *
 * The band is judged for legibility exactly like the plate's own surface: it is the plate composited on
 * an OPAQUE backing, so it is never darker/lighter than the plate over any art, and the ink it pairs
 * with is the plate's own derived foreground (`--color-reading-plate-foreground`), which
 * `palette-contrast.suite.test.ts` floors against this surface.
 */
export function readingBandSurface(base: Oklch): Oklch {
  return rampSurface(base, THEME_DERIVATION.readingPlate.deltaL);
}

/** One elevation ingredient: an OKLCH colour plus the alpha that IS its per-polarity decision. */
export interface ShadowIngredient extends Oklch {
  readonly alpha: number;
}

/** The five `--color-shadow-*` ingredients of the `--shadow-overlay` / `--shadow-cta` recipes. */
export interface ShadowIngredients {
  /** `--shadow-overlay`'s 1px edge ring: light-from-above on a dark base, a dark hairline on a light one. */
  readonly hairline: ShadowIngredient;
  /** `--shadow-overlay`'s inset top-highlight — OFF (α 0) on a light base, where white paints nothing. */
  readonly highlight: ShadowIngredient;
  /** `--shadow-overlay`'s tight contact drop (0 2px 4px). */
  readonly ambientNear: ShadowIngredient;
  /** `--shadow-overlay`'s deep ambient drop (0 12px 32px) — the loudest layer. */
  readonly ambientFar: ShadowIngredient;
  /** `--shadow-cta` / `--shadow-cta-glow`'s inset catch on the PRIMARY fill (not on a surface). */
  readonly ctaHighlight: ShadowIngredient;
}

/**
 * THE ELEVATION INGREDIENTS for a base surface — polarity-derived, so a CUSTOM theme stops inheriting the
 * base palette's dark smoke (#243, the recorded residual of #232).
 *
 * WHY THESE ARE COLOURS AND NOT A `--shadow-*` VALUE (#232, probed with the repo's own compiler):
 * Tailwind v4 INLINES a composite `--shadow-*` `@theme` token into its `.shadow-*` utility at build time,
 * so overriding the composite in a `[data-theme]` block or a `ThemeScope` moves the var and ZERO pixels.
 * A `var()` colour INGREDIENT survives the inlining and resolves in scope — which is the only reason
 * elevation can be theme-reactive at all.
 *
 * WHY IT IS DERIVED AND NOT PICKED: elevation is not a palette role a user has an opinion about; it is
 * what light does to a raised surface, and the only free variable is the surface's POLARITY. Measured on
 * the realistic light bases while a custom light theme still wore the dark arm: the white ring composited
 * to 1.00-1.02:1 against its own page (invisible — #232 measured the same class at 1.29:1 on the Light
 * seed) while the near-black far-ambient hit 3.73-3.93:1, a hard halo ~14px past the card box. The light
 * arm turns those into 1.32-1.34:1 and 1.26-1.27:1 — a ring you can see and a drop you cannot.
 *
 * THE POLARITY IS {@link surfacePolarity}, the SAME measured decision foregrounds and `color-scheme` ride,
 * so a palette can never get light-arm elevation with dark-arm text.
 *
 * THE DARK ARM DOES NOT MOVE, by construction: its numbers ARE the base `@theme` recipe, and every one
 * carries chroma 0, so the emitted `oklch(from <base> l 0 h / a)` is the same white/black the token
 * literal spells whatever hue the base has. The LIGHT arm's small chroma tracks the PALETTE's hue rather
 * than Hearth's 60 — that is the one generalization over the hand-authored seed block, and it is
 * sub-quantization (max 0.25/255 per channel across the shipped light base, composited).
 */
export function shadowIngredients(base: Oklch): ShadowIngredients {
  const arm = surfacePolarity(base) === "light" ? THEME_DERIVATION.shadow.light : THEME_DERIVATION.shadow.dark;
  const at = ({ l, c, alpha }: { readonly l: number; readonly c: number; readonly alpha: number }): ShadowIngredient => ({ l, c, h: base.h, alpha });
  return {
    hairline: at(arm.hairline),
    highlight: at(arm.highlight),
    ambientNear: at(arm.ambientNear),
    ambientFar: at(arm.ambientFar),
    ctaHighlight: at(arm.ctaHighlight),
  };
}

/** The eight neutral-surface lightness deltas one picked base derives its chrome from — the ramp. */
export interface RampDeltas {
  /** The rail: the one member that RECEDES on both polarities. */
  readonly sidebar: number;
  /** The elevation-ramp mid panel (`shell-grid[data-elevation=ramp]`). */
  readonly surfaceRaised: number;
  readonly card: number;
  readonly popover: number;
  /** The hover/selected row fill. */
  readonly accent: number;
  readonly sidebarAccent: number;
  readonly secondary: number;
  /** The low-emphasis fill graphics are painted in (meter tracks, skeletons, track bars). */
  readonly muted: number;
}

/**
 * THE NEUTRAL SURFACE RAMP for a base surface — polarity-derived, so a near-white palette stops
 * collapsing its whole chrome family into one white (#682, the #243 move applied to the surfaces).
 *
 * THE DEFECT THIS CLOSES: the ramp was ONE additive block, every member but `sidebar` positive. Above
 * L ≈ 0.95 the positive members saturate at 1.0 and stop being different colours — measured on the
 * pre-fix derivation at base `oklch(0.98 0.004 75)`: card = popover = secondary = muted = accent =
 * sidebar-accent = surface-raised = L 1.000, i.e. `muted` on `card` at 1.0000:1. Every low-emphasis
 * GRAPHIC is that pairing (the arc meter's track over a card, a skeleton, a track bar), so on a
 * near-white carried palette they rendered as nothing at all.
 *
 * WHY A SECOND ARM AND NOT A SMALLER STEP: the additive form is not merely too big near white, it is the
 * wrong DIRECTION. On a light surface "raised" cannot mean lighter — there is no headroom — it means
 * recessed, which is what the shipped Light seed has always spelled by hand. The light arm IS that
 * block, promoted; the dark arm IS the pre-#682 block. Neither is invented, exactly as #243 did for
 * elevation.
 *
 * THE POLARITY IS {@link surfacePolarity}, the same measured decision foregrounds, `color-scheme` and the
 * elevation arm ride, so a palette can never get light-arm surfaces with dark-arm text.
 *
 * THE SHIPPED DARK ARM DOES NOT MOVE: a proposed ramp surface that stays in the base's contrast-safe
 * polarity returns the pre-#682 number exactly. If an arbitrary accepted base would let a proposed member
 * cross that boundary, only that DERIVED delta retracts toward zero on a 0.001 grid until the base's
 * black/white endpoint clears it. Accent and sidebar-accent are exempt because each owns a dedicated
 * surface foreground; projecting those would erase authored ramp intent for no shared-ink obligation. The
 * authored base is never projected; the three seeds never trigger the retraction; and every semantic
 * foreground therefore has a clearing endpoint without an importer-only refusal band.
 *
 * Foregrounds are solved separately against each ramp member; ramp direction therefore never narrows the
 * accepted base domain.
 */
function contrastSafeRampDelta(base: Oklch, desired: number, polarity: SurfacePolarity): number {
  const endpoint = oklchToSrgb({ l: polarity === "light" ? 0 : 1, c: 0, h: base.h });
  const target = neutralInkTarget(polarity, oklchToSrgb(base));
  const clears = (delta: number): boolean => worstTextContrast(endpoint, [oklchToSrgb(rampSurface(base, delta))]) >= target;
  if (clears(desired)) {
    return desired;
  }
  const sign = Math.sign(desired);
  let safeSteps = 0;
  let unsafeSteps = Math.round(Math.abs(desired) / FOREGROUND_L_STEP);
  while (unsafeSteps - safeSteps > 1) {
    const middle = Math.floor((safeSteps + unsafeSteps) / 2);
    if (clears(sign * middle * FOREGROUND_L_STEP)) {
      safeSteps = middle;
    } else {
      unsafeSteps = middle;
    }
  }
  return Number((sign * safeSteps * FOREGROUND_L_STEP).toFixed(FOREGROUND_L_DECIMALS));
}

export function rampDeltas(base: Oklch): RampDeltas {
  const polarity = surfacePolarity(base);
  const arm = polarity === "light" ? THEME_DERIVATION.ramp.light : THEME_DERIVATION.ramp.dark;
  const projected: RampDeltas = {
    sidebar: contrastSafeRampDelta(base, arm.sidebar, polarity),
    surfaceRaised: contrastSafeRampDelta(base, arm.surfaceRaised, polarity),
    card: contrastSafeRampDelta(base, arm.card, polarity),
    popover: contrastSafeRampDelta(base, arm.popover, polarity),
    accent: arm.accent,
    sidebarAccent: arm.sidebarAccent,
    secondary: contrastSafeRampDelta(base, arm.secondary, polarity),
    muted: contrastSafeRampDelta(base, arm.muted, polarity),
  };
  return Object.entries(projected).every(([role, delta]) => delta === arm[role as keyof RampDeltas]) ? arm : projected;
}

export type ChartRamp = readonly [Oklch, Oklch, Oklch, Oklch, Oklch];

// The shipped dark ramp, byte-for-byte. A carried dark palette that already gives these colors 3:1 on
// every chart host keeps them exactly; the search only takes over when that inherited ramp is illegible.
const LEGACY_CHART_RAMP: ChartRamp = [
  { l: 0.72, c: 0.175, h: 52 },
  { l: 0.7, c: 0.1, h: 200 },
  { l: 0.68, c: 0.12, h: 300 },
  { l: 0.74, c: 0.11, h: 130 },
  { l: 0.7, c: 0.12, h: 35 },
];

interface ChartRampSpec {
  readonly c: number;
  readonly h: number;
  readonly brightTargetL: number;
  readonly darkTargetL: number;
}

// Five separated hue sectors, with deliberately staggered target tones. The static seed arms remain the
// authored palette; these are only the custom-palette fallback where one inherited arm cannot serve an
// arbitrary surface. Staggering keeps adjacent warm categories distinct after sRGB gamut mapping.
const CUSTOM_CHART_SPECS: readonly [ChartRampSpec, ChartRampSpec, ChartRampSpec, ChartRampSpec, ChartRampSpec] = [
  { c: 0.14, h: 50, brightTargetL: 0.98, darkTargetL: 0.18 },
  { c: 0.11, h: 200, brightTargetL: 0.82, darkTargetL: 0.36 },
  { c: 0.12, h: 285, brightTargetL: 0.9, darkTargetL: 0.28 },
  { c: 0.11, h: 125, brightTargetL: 0.86, darkTargetL: 0.32 },
  { c: 0.13, h: 350, brightTargetL: 0.76, darkTargetL: 0.4 },
];

const CHART_L_STEP = 0.001;
const CHART_PIXEL_DISTANCE_FLOOR = 30;

function quantizedRgb(color: Oklch): Rgb {
  const { r, g, b } = oklchToSrgb(color);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function chartContrast(fill: Oklch, surfaces: readonly Oklch[]): number {
  const floatFill = oklchToSrgb(fill);
  const pixelFill = quantizedRgb(fill);
  return Math.min(
    ...surfaces.flatMap((surface) => {
      const floatSurface = oklchToSrgb(surface);
      return [wcagContrastRatio(floatFill, floatSurface), wcagContrastRatio(pixelFill, quantizedRgb(surface))];
    }),
  );
}

function chartPixelDistance(ramp: ChartRamp): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const [left, color] of ramp.entries()) {
    for (const other of ramp.slice(left + 1)) {
      const a = quantizedRgb(color);
      const b = quantizedRgb(other);
      minimum = Math.min(minimum, Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b));
    }
  }
  return minimum;
}

function chartColor(spec: ChartRampSpec, direction: "bright" | "dark", surfaces: readonly Oklch[]): Oklch | null {
  const target = direction === "bright" ? spec.brightTargetL : spec.darkTargetL;
  const targetStep = Math.round(target / CHART_L_STEP);
  const limitStep = direction === "bright" ? Math.round(1 / CHART_L_STEP) : 0;
  const increment = direction === "bright" ? 1 : -1;
  for (let step = targetStep; direction === "bright" ? step <= limitStep : step >= limitStep; step += increment) {
    const candidate = { l: step * CHART_L_STEP, c: spec.c, h: spec.h };
    if (chartContrast(candidate, surfaces) >= AA_LARGE_RATIO) {
      return candidate;
    }
  }
  return null;
}

function chartFamily(direction: "bright" | "dark", surfaces: readonly Oklch[]): ChartRamp | null {
  const colors = CUSTOM_CHART_SPECS.map((spec) => chartColor(spec, direction, surfaces));
  const [one, two, three, four, five] = colors;
  if (
    one === null ||
    one === undefined ||
    two === null ||
    two === undefined ||
    three === null ||
    three === undefined ||
    four === null ||
    four === undefined ||
    five === null ||
    five === undefined
  ) {
    return null;
  }
  const ramp: ChartRamp = [one, two, three, four, five];
  return chartPixelDistance(ramp) >= CHART_PIXEL_DISTANCE_FLOOR ? ramp : null;
}

/**
 * Five categorical fills for a carried custom surface (#939). The judge is the real chart-host family —
 * base, card, raised surface and sidebar — at the worse of float and quantized sRGB contrast. A single
 * light/dark token arm cannot cover the accepted mid-tone bases around the foreground pivot, so the clamp
 * emits this concrete ramp instead of asking `color-scheme` to choose an arm that is known to fail there.
 *
 * The search is bounded and deterministic: 0.001 lightness steps, one coherent bright or dark family, and
 * the polarity-preferred family first. If gamut mapping collapses two categories below the framebuffer
 * distance floor, the opposite family is tried. The legacy dark colors are returned unchanged whenever
 * they already clear all four hosts, preserving the sacred dark-room pixels by construction.
 */
export function chartRampForSurface(base: Oklch): ChartRamp {
  const deltas = rampDeltas(base);
  const surfaces = [base, rampSurface(base, deltas.card), rampSurface(base, deltas.surfaceRaised), rampSurface(base, deltas.sidebar)];
  if (LEGACY_CHART_RAMP.every((color) => chartContrast(color, surfaces) >= AA_LARGE_RATIO)) {
    return LEGACY_CHART_RAMP;
  }
  const preferred: readonly ["bright" | "dark", "bright" | "dark"] = surfacePolarity(base) === "dark" ? ["bright", "dark"] : ["dark", "bright"];
  for (const direction of preferred) {
    const ramp = chartFamily(direction, surfaces);
    if (ramp !== null) {
      return ramp;
    }
  }
  // Black or white must clear a bounded family of opaque surfaces; this is unreachable for a finite
  // parsed base and kept loud because silently inheriting the failing static arm recreates the defect.
  throw new Error("unable to derive a contrast-safe custom chart ramp");
}

/** The alpha grid the accent-fill search walks its LIGHTNESS on — the same 3-decimal precision the plate's
 *  alpha search uses, for the same reason: the number reaches a CSS literal. */
const ACCENT_L_STEP = 0.001;

/**
 * THE ACCENT-FILL SEARCH'S JUDGE — the ratio of a fill against its card measured BOTH ways, at the WORSE
 * of the two (#692): the float triple this file's math produces, and the 8-BIT PIXEL a browser actually
 * paints (`Math.round`). Everything else here judges the float, and for a fence a fraction of a percent
 * does not matter; for a search that STOPS at its first clearing step it decides the answer, in both
 * directions. MEASURED at the shipped case (Hearth's accent over the near-white card): at L 0.680 float
 * 3.0111 / quantized 3.0098, and the CT browser's framebuffer reads 3.0098 — the quantized number to the
 * digit. Quantization is NOT monotone in L (L 0.681 measures float 2.9995 but quantized 3.0096), so a
 * float-only judge can ship a fill the browser paints under the floor, and a quantized-only judge can stop
 * at a step whose true colour is still under it. Taking the minimum is the only conservative reading.
 */
function fillVsCardRatio(fill: Rgb, card: Rgb): number {
  return Math.min(wcagContrastRatio(fill, card), wcagContrastRatio(quantized(fill), quantized(card)));
}

/**
 * THE ACCENT FILL'S LIGHTNESS for a carried base — the §7a ink clamp's shape, applied to the one PICKED
 * token that paints a GRAPHIC rather than an ink (#692). `null` ⇒ the accent already clears against the
 * card it is painted on, so the caller passes it through BYTE-IDENTICALLY (the no-op-where-the-pick-was-
 * sensible guarantee `proseInkLightness` states); a number ⇒ the lightness to re-derive it at, keeping the
 * author's hue and chroma.
 *
 * THE MOTIVATING MEASUREMENT (#692, and it is not a light-arm ramp defect): `--color-primary` is never
 * derived — `clamp.ts` emits the PICKED accent, so a scope that carries a light background and no accent
 * INHERITS the app theme's. Hearth's `oklch(0.72 0.175 52)` over the near-white base's derived card
 * (0.98 → 0.995) measures 2.5858:1 — the arc meter's VALUE arc, the part that carries the reading, under
 * WCAG 1.4.11's 3:1 floor. The shipped Light seed's own primary measures 5.07:1 against the same card, so
 * there is nothing to promote and no ramp arm to move: this is the #243/#682 POLARITY DIVORCE ("a custom
 * light theme inherited the base palette's dark smoke") one token over, and the remedy is the one #236
 * already minted for inks — judge the carried token against the surface it will actually be painted on.
 *
 * THE SURFACE IS THE CARD, not the base: every low-emphasis graphic this protects (the arc meter's value
 * arc, a ring gauge's fill, a track bar) is painted on a panel, and the card is the ramp member panels
 * take. The floor is {@link AA_LARGE_RATIO} (3:1) because a fill IS a non-text graphical object.
 *
 * THE DIRECTION IS THE CARD'S measured polarity, so this can never fight its foreground: on a light card
 * the accent must go DARKER; on a dark card, lighter. The search walks `ACCENT_L_STEP` at a time
 * and stops at the FIRST clearing lightness — the smallest move that buys legibility, so an author's pick
 * is nudged rather than replaced. A translucent accent is composited over the card before judging (a naive
 * ratio on a translucent fill lies, `proseInkLightness`'s own trap) and the caller re-emits it OPAQUE.
 *
 * Returns `null` rather than a bound when NO lightness in `[fgLMin, fgLMax]` clears — a base whose card
 * cannot carry this hue at all. Failing open is the pre-#692 behaviour, and inventing a colour is what
 * this whole file exists not to do.
 */
export function accentFillLightness(accent: Oklch, accentAlpha: number, base: Oklch): number | null {
  const card = oklchToSrgb(rampSurface(base, rampDeltas(base).card));
  const at = (l: number): Rgb => {
    const opaque = oklchToSrgb({ l, c: accent.c, h: accent.h });
    return accentAlpha < 1 ? compositeSrgb(opaque, accentAlpha, card) : opaque;
  };
  if (fillVsCardRatio(at(accent.l), card) >= AA_LARGE_RATIO) {
    return null;
  }
  const towardDark = surfacePolarity(base) === "light";
  const limit = towardDark ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax;
  const steps = Math.round(Math.abs(accent.l - limit) / ACCENT_L_STEP);
  for (let step = 1; step <= steps; step += 1) {
    const l = accent.l + (towardDark ? -step : step) * ACCENT_L_STEP;
    // Judged OPAQUE at the re-derived lightness: the caller emits it opaque for the same reason the ink
    // clamp does — a minimal alpha sits on the boundary and re-judging it is a fixed point that never passes.
    if (fillVsCardRatio(oklchToSrgb({ l, c: accent.c, h: accent.h }), card) >= AA_LARGE_RATIO) {
      // Re-round: accent.l + n×0.001 accumulates binary-float dust that would reach the CSS literal.
      return Math.round(l / ACCENT_L_STEP) * ACCENT_L_STEP;
    }
  }
  return null;
}
