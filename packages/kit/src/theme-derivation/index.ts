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
//     TWO-ARM `ramp` block, selected by the same measured polarity: a dark base's chrome rises off it, a
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
 *  `readingPlate` is the transcript's over-art text backing (`--color-reading-plate`): the base
 *  surface with only L shifted (like the ramp) but CARRYING ITS OWN ALPHA, because the plate composites
 *  over wallpaper art. It is NOT the backdrop dimmer (`--color-backdrop`, polarity-FIXED smoke): a
 *  reading plate must follow the palette's polarity so the palette's own inks land on their own surface
 *  — one `--color-scrim` token serving both jobs is the defect this splits. `deltaL` −0.038 reproduces the
 *  retired scrim's dark value off the Hearth base to the digit (0.158 − 0.038 = 0.120); `alpha` 0.65 is
 *  the MEASURED floor (live A/B: 0.65 turned the failing carried-light room's dialogue
 *  1.32→6.79 and body 1.14→14.33 while the dark-art room stayed 12.06/13.60 and visually identical),
 *  a plate floor. `alpha` is the FLOOR the
 *  polarity-aware {@link readingPlateAlpha} starts from, no longer the emitted value for every palette
 *  (read that function's contract for the algebra and for `inkReferenceRatio`).
 *
 *  The plate's OPAQUE sibling — the sticky attribution BAND — uses the same
 *  `deltaL` off the same base, at {@link READING_BAND_ALPHA}. It carries no alpha of its own to declare
 *  here precisely because it is the plate at α 1.
 *
 *  `shadow` is the two-armed ELEVATION recipe {@link shadowIngredients} selects between — the five
 *  `--color-shadow-*` ingredients `--shadow-overlay` / `--shadow-cta` are built from. Neither
 *  arm is invented: `dark` is the base `@theme` recipe digit-for-digit and `light` is the Light seed's
 *  own measured block, promoted from a hand-authored per-seed value into the derivation a CUSTOM theme
 *  gets too. The two arms are what an elevation IS on each polarity: on a dark surface the ring and the
 *  inset are light-from-above (white alpha) and the drop is near-black; on a light surface a white ring
 *  is a 1.00:1 ghost, the inset paints nothing at all (α 0), and a near-black drop reads as a torn-out
 *  sticker — so the ring inverts to a dark hairline and the drop lifts to L 0.35 at a third of the alpha.
 *  Only `l`/`c`/`alpha` live here: the HUE is the palette's own (see the function).
 *
 *  `ramp` is the neutral SURFACE ramp, and it is two-armed for the same reason and measured polarity
 *  (the polarity split applied to the surfaces): the arms are lightness DELTAS off the picked base that
 *  {@link rampDeltas} selects between. Neither arm is invented — `dark` is the original single additive
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

/** WCAG AA for normal-size text — the floor every orb pairing is held to. */
export const AA_NORMAL_RATIO = 4.5;
/** Orb's authored-neutral-ink target. It is deliberately above the legal floor because the browser's
 *  8-bit OKLCH resolution and alpha composition can spend contrast after the analytic solve. A host near
 *  WCAG's black/white crossover cannot physically reach 4.6, so each search caps this aim at the chosen
 *  polarity endpoint's measured capacity rather than narrowing the accepted theme domain. */
const AA_NORMAL_DERIVATION_RATIO = 4.6;
/** WCAG 2.x SC 1.4.3 Contrast (Minimum), large text: 3:1. */
export const AA_LARGE_RATIO = 3;
/** WCAG 2.x SC 1.4.11 Non-text Contrast: 3:1 for a user-interface component's boundary or a graphic that
 *  carries meaning. The same number as large text, but a separate criterion with its own literal. */
export const AA_NON_TEXT_RATIO = 3;

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

/** OKLCH → linear sRGB, unclamped, so a channel outside 0–1 shows the colour is out of gamut. */
function linearSrgb({ l, c, h }: Oklch): readonly [number, number, number] {
  const radians = h / DEGREES_PER_RADIAN;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lRoot = (l + LMS_L_A * a + LMS_L_B * b) ** CUBE;
  const mRoot = (l - LMS_M_A * a - LMS_M_B * b) ** CUBE;
  const sRoot = (l - LMS_S_A * a - LMS_S_B * b) ** CUBE;
  return [
    RGB_R_L * lRoot - RGB_R_M * mRoot + RGB_R_S * sRoot,
    -RGB_G_L * lRoot + RGB_G_M * mRoot - RGB_G_S * sRoot,
    -RGB_B_L * lRoot - RGB_B_M * mRoot + RGB_B_S * sRoot,
  ];
}

/** OKLCH → sRGB (0–255), gamut-clamped. The inverse of the importer's sRGB→OKLCH. */
export function oklchToSrgb(color: Oklch): Rgb {
  const [r, g, b] = linearSrgb(color);
  return { r: gammaEncode(r), g: gammaEncode(g), b: gammaEncode(b) };
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

/** sRGB (0–255) → OKLCH — the exact inverse of {@link oklchToSrgb} (lets the prose-ink clamp and
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

/** WCAG 2.x relative luminance (0–1) of an sRGB colour; channels outside 0–255 are clamped. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (raw: number): number => {
    const c = Math.max(0, Math.min(SRGB_MAX, raw)) / SRGB_MAX;
    return c <= WCAG_LINEAR_THRESHOLD ? c / GAMMA_LINEAR_SLOPE : ((c + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT;
  };
  return LUMA_R * channel(r) + LUMA_G * channel(g) + LUMA_B * channel(b);
}

/** The WCAG contrast ratio (1–21) between two OPAQUE sRGB colours. Composite any alpha before calling. */
export function wcagContrastRatio(a: Rgb, b: Rgb): number {
  return luminanceContrast(relativeLuminance(a), relativeLuminance(b));
}

function luminanceContrast(la: number, lb: number): number {
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

/** A re-derived prose ink: the lightness, and the chroma where the author's own could not clear its hosts. */
export interface ProseInkCorrection {
  readonly l: number;
  readonly c: number;
}

const PROSE_CHROMA_STEP = 0.01;

// A chromatic candidate must carry the derivation margin the browser's gamut mapping spends; a neutral one may settle for what its end point reaches.
function proseInkAim(endpoint: number, neutral: boolean): number {
  return neutral ? Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, endpoint)) : AA_NORMAL_DERIVATION_RATIO;
}

/**
 * The §7a prose-ink clamp decision — for the four AUTHOR-PICKED transcript inks
 * (`speaker`/`dialogueColor`/`narrationColor`/`bodyColor`), the only inks exempt from the house
 * "a foreground is never picked, only derived" law. Judged against the surfaces it is read on, at the worse of the float colour and the 8-bit pixel:
 *   • `null`  — the authored ink already clears AA on every host: keep it BYTE-IDENTICAL
 *     (the no-op-where-the-card-was-sensible guarantee; the dark-art rooms do not move a pixel);
 *   • a correction — the ink fails AA there: the least move from the author's lightness toward the polarity's end
 *     point that clears them, keeping the author's hue and chroma where it can.
 * `inkAlpha < 1` composites the ink over the base first — a naive ratio on a translucent ink lies. (The
 * comparison stays INSIDE the backticks: tsdoc reads a bare `<` followed by a space as a malformed HTML
 * element and the eslint tsdoc/syntax rule reds the file.)
 *
 * `hosts` are the surfaces the ink is read on, the base alone unless a carried palette names its reading hosts
 * ({@link carriedReadingHosts}), so a pick that clears its page moves only as far as those hosts need. Near the crossover
 * chroma itself spends more luminance than any lightness returns, so only there the chroma steps down: on a mid-grey page
 * the hue gives way before the reading floor does (D202). A solved lightness also keeps the chroma inside sRGB, because
 * clipping there moves the hue.
 */
export function proseInkCorrection(ink: Oklch, inkAlpha: number, base: Oklch, hosts: readonly Oklch[] = [base]): ProseInkCorrection | null {
  const grounds = hosts.map((host) => oklchToSrgb(host));
  const authored = oklchToSrgb(ink);
  const clearsAuthored = (ground: Rgb): boolean =>
    worstTextContrast(inkAlpha < 1 ? compositeSrgb(authored, inkAlpha, ground) : authored, [ground]) >= AA_NORMAL_RATIO;
  if (grounds.every(clearsAuthored)) {
    return null;
  }
  const direction = surfacePolarity(base) === "light" ? -1 : 1;
  const steps = Math.ceil(ink.c / PROSE_CHROMA_STEP);
  for (let step = 0; step <= steps; step += 1) {
    const c = step === 0 ? ink.c : Number(Math.max(0, ink.c - step * PROSE_CHROMA_STEP).toFixed(FOREGROUND_L_DECIMALS));
    const contrast = (lightness: number): number => worstTextContrast(oklchToSrgb({ l: lightness, c: gamutChroma(lightness, c, ink.h), h: ink.h }), grounds);
    const aim = proseInkAim(contrast(direction > 0 ? 1 : 0), step === steps);
    const l = nearestClearingLightness(ink.l, direction, (candidate) => contrast(candidate) >= aim);
    if (l !== null) {
      const painted = gamutChroma(l, c, ink.h);
      return { l: Number(l.toFixed(FOREGROUND_L_DECIMALS)), c: painted === c ? c : Math.floor(painted / FOREGROUND_L_STEP) / (1 / FOREGROUND_L_STEP) };
    }
  }
  // Hosts on both sides of the crossover admit no one ink, so a pick that holds its base keeps it.
  return clearsAuthored(oklchToSrgb(base)) ? null : { l: derivedForegroundLightness(base), c: 0 };
}

const SURFACE_POLARITIES = ["dark", "light"] as const;
export type SurfacePolarity = (typeof SURFACE_POLARITIES)[number];

const FOREGROUND_L_STEP = 0.001;
const FOREGROUND_L_DECIMALS = 3;

/** A colour as the 8-bit pixel the browser paints it at. */
export function quantized({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

/** A colour's relative luminance as a float colour and as its 8-bit pixel: the two a text pair is judged at. */
interface Luminances {
  readonly float: number;
  readonly pixel: number;
}

function luminances(color: Rgb): Luminances {
  return { float: relativeLuminance(color), pixel: relativeLuminance(quantized(color)) };
}

// The searches judge many inks against fixed grounds, so a caller resolves each ground's luminances once.
function worstLuminanceContrast(ink: Luminances, surfaces: readonly Luminances[]): number {
  return Math.min(...surfaces.flatMap((surface) => [luminanceContrast(ink.float, surface.float), luminanceContrast(ink.pixel, surface.pixel)]));
}

function worstTextContrast(ink: Rgb, surfaces: readonly Rgb[]): number {
  return worstLuminanceContrast(
    luminances(ink),
    surfaces.map((surface) => luminances(surface)),
  );
}

function neutralInkTarget(polarity: SurfacePolarity, anchor: Rgb): number {
  const endpoint = oklchToSrgb({ l: polarity === "light" ? 0 : 1, c: 0, h: 0 });
  return Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstTextContrast(endpoint, [anchor])));
}

function tryNeutralInkLightness(polarity: SurfacePolarity, surfaces: readonly Rgb[], initial: number, target: number): number | null {
  const increment = polarity === "light" ? -FOREGROUND_L_STEP : FOREGROUND_L_STEP;
  const limit = polarity === "light" ? 0 : 1;
  const grounds = surfaces.map((surface) => luminances(surface));
  const clears = (l: number): boolean => worstLuminanceContrast(luminances(oklchToSrgb({ l, c: 0, h: 0 })), grounds) >= target;
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

/** A shared foreground for a documented family of nearby hosts (background/card/raised), and any composited fills that ink also sits on. */
export function derivedForegroundLightnessForSurfaces(surfaces: readonly Oklch[], composited: readonly Rgb[] = []): number {
  const anchor = surfaces[0];
  if (anchor === undefined) {
    throw new Error("foreground requires at least one surface");
  }
  const polarity = surfacePolarity(anchor);
  const initial = polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax;
  const anchorRgb = oklchToSrgb(anchor);
  return neutralInkLightness(polarity, [...surfaces.map((surface) => oklchToSrgb(surface)), ...composited], initial, neutralInkTarget(polarity, anchorRgb));
}

/** One neutral ramp surface: the base with only L shifted (hue + chroma held), as the clamp emits. */
export function rampSurface(base: Oklch, deltaL: number): Oklch {
  return { l: clamp01(base.l + deltaL), c: base.c, h: base.h };
}

export interface MutedForegroundPair {
  readonly lightness: number;
  /** The lightness the input fill washes at {@link THEME_DERIVATION}'s `inputAlpha`. */
  readonly inputWash: number;
}

/** The shared low-emphasis ink plus the input wash it must clear. The wash lifts toward the ink, the way every
 * seed spells it; where that lift would pull an input below the anchor's attainable render target it runs the
 * other way, at the same alpha, so the fill stays visible and only gains contrast against the ink. */
export function derivedMutedForegroundPair(base: Oklch, opaqueSurfaces: readonly Oklch[], inputBackings: readonly Oklch[]): MutedForegroundPair {
  const polarity = surfacePolarity(base);
  const initial = polarity === "light" ? THEME_DERIVATION.mutedLMin : THEME_DERIVATION.mutedLMax;
  const target = neutralInkTarget(polarity, oklchToSrgb(base));
  const opaque = opaqueSurfaces.map((surface) => oklchToSrgb(surface));
  const solve = (inputWash: number): MutedForegroundPair | null => {
    const wash = oklchToSrgb({ l: inputWash, c: 0, h: base.h });
    const fills = inputBackings.map((backing) => compositeSrgb(wash, THEME_DERIVATION.inputAlpha, oklchToSrgb(backing)));
    const lightness = tryNeutralInkLightness(polarity, [...opaque, ...fills], initial, target);
    return lightness === null ? null : { lightness, inputWash };
  };
  const pair = solve(derivedForegroundLightness(base)) ?? solve(polarity === "light" ? 1 : 0);
  if (pair === null) {
    throw new Error("unable to derive a contrast-safe muted/input pair");
  }
  return pair;
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
 * THE READING PLATE'S ALPHA for a base surface — polarity-aware, derived, never designed.
 *
 * WHY IT CANNOT BE ONE NUMBER. The plate is translucent, so the surface the transcript's ink actually
 * lands on is `plate·α + art·(1−α)` — the ART is in the composite, and art is arbitrary.
 *
 * THIS DERIVATION KEEPS RAW ART AS ITS INPUT, DELIBERATELY, EVEN THOUGH RAW ART IS NO LONGER LEGAL.
 * The wallpaper scrim has a derived floor of 0.45, so raw pixels are not legal. Re-solving the alpha against SCRIMMED art would
 * relax it — and relaxing a shipped plate alpha moves pixels in every light room for no legibility gain.
 * Raw art is therefore retained as a strictly-conservative input: the scrim floor is an ADDITIONAL
 * guarantee stacked under this one, never a reason to weaken it. Which art is the WORST case is a function of the
 * plate's POLARITY, and the intuition runs backwards: a LIGHT plate carries DARK inks, so the composite
 * is worst when the art DARKENS it ⇒ BLACK art; a DARK plate carries LIGHT inks ⇒ WHITE art. Measured
 * live (the chats rescoring pass): at the flat 0.65 the light-palette
 * done-bar room read narration 3.48:1 / dialogue 4.09:1 over the bright wallpaper regions and 4.94/5.39
 * over the dark ones — the same ink, the same alpha, the scroll position deciding the verdict.
 *
 * THE REFERENCE INK, and why it is not AA itself. The §7a clamp (`proseInkCorrection`) guarantees an ink
 * clears AA_NORMAL against the BASE. That floor is unreachable on the plate at ANY alpha: the plate is
 * `deltaL` darker than the base, so even at α = 1 an ink sitting exactly on 4.5 vs the base measures
 * ~4.1 vs the plate — preserving the base guarantee would need `deltaL` to move to 0, i.e. the plate to
 * BE the base, which deletes the token. The achievable floor is
 * `4.5 × (baseLuminance + 0.05) / (plateLuminance + 0.05)`
 * — measured 5.04–5.25 across the realistic light bases — so the derivation
 * must name a reference ABOVE it. It protects `inkReferenceRatio` (6:1 vs the base) — OWNER-RULED
 * off the table below, the knob being a legibility-vs-art trade nobody else may set: the
 * legibility of the LEAST legible ink orb SHIPS (the light palette's speaker, 6.02:1), kept beside
 * the shipped palettes so the reference cannot rot away from the shipped palettes. The
 * alphas that buys, and their cost in art: ref 6 → α 0.921 · ref 5.5 → 0.960 · ref 5.2 → 0.985 ·
 * ref 5.0 → 1 (an opaque plate, no window at all).
 *
 * THE STATED RESIDUAL: an ink between AA_NORMAL and `inkReferenceRatio` against its own base is legible
 * on the plate over ordinary art and is NOT guaranteed over the worst legal art. It is a real case, not
 * a hypothetical — the owner's own done-bar card (harvested live: base `oklch(0.98 0.004 78)`,
 * speaker `oklch(0.53 0.14 58)` = 5.20:1) sits there, and reads 3.90 over the plate over pure black
 * while measuring 5.51 in the room. Its three FILED inks are the ones this closes: dialogue 3.38→6.81,
 * narration 2.98→6.01, prose-body 5.15→10.37. Moving the residual is a `deltaL` question, not an alpha
 * one — an owner fork, not a retune.
 *
 * THE DARK ARM KEEPS THE MEASURED FLOOR, and that is an owner ruling, not an oversight. D144(d): "Inks
 * are guaranteed vs their BASE, not worst-case art pixels — closing that would move the sacred dark
 * rooms (owner-adjacent, refused)", restated as the fix's hard constraint. The dark plates carry
 * the same defect over BRIGHT art (measured at 0.65: hearth speaker 2.51, mocha speaker 2.50) and
 * closing it needs α 0.86 — exactly the sacred-room move that was refused. So a dark base returns the
 * floor unchanged and the dark rooms do not move a pixel BY CONSTRUCTION.
 *
 * Returns a 3-decimal alpha in `[readingPlate.alpha, 1]`: the smallest one at which the reference ink
 * clears AA_NORMAL over the plate composited on the worst legal art. No art is ever sampled.
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
 * THE STICKY ATTRIBUTION BAND'S ALPHA — opaque, and that is an OWNER RULING, not a tuning (re-stated as the hard constraint of that ruling). A pinned band that lets the prose it is pinned
 * over show through does not own its slice; the band is the one over-prose backing in the transcript
 * that must OCCLUDE. Named rather than inlined because relative-colour syntax DEFAULTS the omitted
 * alpha slot to the ORIGIN's — deriving the band off a translucent plate without spelling `/ 1` would
 * silently reproduce the translucency this constant exists to refuse (the same fixed-point that bit the
 * §7a ink clamp).
 */
export const READING_BAND_ALPHA = 1;

/** One elevation ingredient: an OKLCH colour plus the alpha that IS its per-polarity decision. */
interface ShadowIngredient extends Oklch {
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
 * base palette's dark smoke (a recorded residual).
 *
 * WHY THESE ARE COLOURS AND NOT A `--shadow-*` VALUE (probed with the repo's own compiler):
 * Tailwind v4 INLINES a composite `--shadow-*` `@theme` token into its `.shadow-*` utility at build time,
 * so overriding the composite in a `[data-theme]` block or a `ThemeScope` moves the var and ZERO pixels.
 * A `var()` colour INGREDIENT survives the inlining and resolves in scope — which is the only reason
 * elevation can be theme-reactive at all.
 *
 * WHY IT IS DERIVED AND NOT PICKED: elevation is not a palette role a user has an opinion about; it is
 * what light does to a raised surface, and the only free variable is the surface's POLARITY. Measured on
 * the realistic light bases while a custom light theme still wore the dark arm: the white ring composited
 * to 1.00-1.02:1 against its own page (invisible — the same class measured 1.29:1 on the Light
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
  /** The rail: the one member that RECEDES on both arms, and rises on a mirrored ramp, where every member flips. */
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
 * collapsing its whole chrome family into one white (the polarity split applied to the surfaces).
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
 * block, promoted; the dark arm IS the earlier block. Neither is invented, exactly as the polarity split did for
 * elevation.
 *
 * THE POLARITY IS {@link surfacePolarity}, the same measured decision foregrounds, `color-scheme` and the
 * elevation arm ride, so a palette can never get light-arm surfaces with dark-arm text.
 *
 * THE SHIPPED DARK ARM DOES NOT MOVE: a proposed ramp surface that stays in the base's contrast-safe
 * polarity returns the original single-block number exactly. If an arbitrary accepted base would let a proposed member
 * cross that boundary, only that DERIVED delta retracts toward zero on a 0.001 grid until the base's
 * black/white endpoint clears it. Accent and sidebar-accent are exempt because each owns a dedicated
 * surface foreground, with one D336 exception: accent shares its ink with muted (the neutral tone's two tints), so
 * where that family has no ink the accent delta retracts toward the base ({@link accentFamilyDelta}). The
 * authored base is never projected; and every semantic
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

/**
 * The accent delta, retracted toward the base only when the D336 accent ink could not cover both neutral tints
 * (accent and muted). Near the crossover the unprojected accent lands on the other polarity from muted, and no
 * one ink clears both; at delta zero the accent is the base, which shares muted's endpoint by projection.
 */
function accentFamilyDelta(base: Oklch, desired: number, muted: number): number {
  const mutedSurface = rampSurface(base, muted);
  const clears = (delta: number): boolean => familyForegroundLightness([rampSurface(base, delta), mutedSurface]) !== null;
  const sign = Math.sign(desired);
  for (let steps = Math.round(Math.abs(desired) / FOREGROUND_L_STEP); steps > 0; steps -= 1) {
    const delta = Number((sign * steps * FOREGROUND_L_STEP).toFixed(FOREGROUND_L_DECIMALS));
    if (clears(delta)) {
      return steps === Math.round(Math.abs(desired) / FOREGROUND_L_STEP) ? desired : delta;
    }
  }
  return 0;
}

function projectedRamp(base: Oklch, arm: RampDeltas, polarity: SurfacePolarity): RampDeltas {
  const muted = contrastSafeRampDelta(base, arm.muted, polarity);
  return {
    sidebar: contrastSafeRampDelta(base, arm.sidebar, polarity),
    surfaceRaised: contrastSafeRampDelta(base, arm.surfaceRaised, polarity),
    card: contrastSafeRampDelta(base, arm.card, polarity),
    popover: contrastSafeRampDelta(base, arm.popover, polarity),
    // The strongest tint a page ink can still sit on: the family retraction first, then the same bound the other members take.
    accent: contrastSafeRampDelta(base, accentFamilyDelta(base, arm.accent, muted), polarity),
    sidebarAccent: arm.sidebarAccent,
    secondary: contrastSafeRampDelta(base, arm.secondary, polarity),
    muted,
  };
}

/** How much lightness a projection took back from its arm: what a ramp loses of the steps that tell its members apart. */
function rampRetraction(arm: RampDeltas, projected: RampDeltas): number {
  return Object.entries(projected).reduce((lost, [role, delta]) => lost + Math.abs(arm[role as keyof RampDeltas] - delta), 0);
}

function mirroredArm(arm: RampDeltas): RampDeltas {
  return {
    sidebar: -arm.sidebar,
    surfaceRaised: -arm.surfaceRaised,
    card: -arm.card,
    popover: -arm.popover,
    accent: -arm.accent,
    sidebarAccent: -arm.sidebarAccent,
    secondary: -arm.secondary,
    muted: -arm.muted,
  };
}

/**
 * Both arms step toward the black/white crossover, so a base near it has no room on its arm's side: projection flattens
 * the members into one value there, and hover and selection stop reading. The room is on the far side, where the
 * polarity's ink only gains contrast, so a base whose arm does not fit takes the arm mirrored whenever that keeps more of
 * the ramp. An arm that fits is returned as authored.
 */
export function rampDeltas(base: Oklch): RampDeltas {
  const polarity = surfacePolarity(base);
  const arm = polarity === "light" ? THEME_DERIVATION.ramp.light : THEME_DERIVATION.ramp.dark;
  const projected = projectedRamp(base, arm, polarity);
  const lost = rampRetraction(arm, projected);
  if (lost === 0) {
    return arm;
  }
  const mirror = mirroredArm(arm);
  const mirrored = projectedRamp(base, mirror, polarity);
  return rampRetraction(mirror, mirrored) < lost ? mirrored : projected;
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
  return quantized(oklchToSrgb(color));
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
    if (chartContrast(candidate, surfaces) >= AA_NON_TEXT_RATIO) {
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
 * Five categorical fills for a carried custom surface. The judge is the real chart-host family —
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
  if (LEGACY_CHART_RAMP.every((color) => chartContrast(color, surfaces) >= AA_NON_TEXT_RATIO)) {
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
 * of the two: the float triple this file's math produces, and the 8-BIT PIXEL a browser actually
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

/** The accent-fill search's verdict: the accent already clears, a corrected fill, or no lightness that clears. */
export type AccentFill = { readonly kind: "clears" } | { readonly kind: "corrected"; readonly fill: Oklch } | { readonly kind: "none" };

/**
 * THE ACCENT FILL'S LIGHTNESS for a carried base — the §7a ink clamp's shape, applied to the one PICKED
 * token that paints a GRAPHIC rather than an ink. `clears` ⇒ the accent already clears against the
 * card it is painted on, so the caller passes it through (the no-op-where-the-pick-was-sensible guarantee
 * `proseInkCorrection` states); `corrected` ⇒ the fill re-derived at a new lightness, keeping the author's hue
 * and chroma as far as the sRGB gamut allows.
 *
 * THE MOTIVATING MEASUREMENT (and it is not a light-arm ramp defect): `--color-primary` is never
 * derived — `clamp.ts` emits the PICKED accent, so a scope that carries a light background and no accent
 * INHERITS the app theme's. Hearth's `oklch(0.72 0.175 52)` over the near-white base's derived card
 * (0.98 → 0.995) measures 2.5858:1 — the arc meter's VALUE arc, the part that carries the reading, under
 * WCAG 1.4.11's 3:1 floor. The shipped Light seed's own primary measures 5.07:1 against the same card, so
 * there is nothing to promote and no ramp arm to move: this is the POLARITY DIVORCE ("a custom
 * light theme inherited the base palette's dark smoke") one token over, and the remedy is the one the ink clamp
 * already applies — judge the carried token against the surface it will actually be painted on.
 *
 * THE SURFACE IS THE CARD, not the base: every low-emphasis graphic this protects (the arc meter's value
 * arc, a ring gauge's fill, a track bar) is painted on a panel, and the card is the ramp member panels
 * take. The floor is {@link AA_NON_TEXT_RATIO} (3:1) because a fill IS a non-text graphical object. The neutral tint-active
 * is judged too, because a glyph paints the fill on the tone's tints.
 *
 * THE DIRECTION IS THE CARD'S measured polarity: on a light card the accent goes DARKER; on a dark
 * card, lighter. The search walks `ACCENT_L_STEP` at a time
 * and stops at the FIRST clearing lightness — the smallest move that buys legibility, so an author's pick
 * is nudged rather than replaced. A translucent accent is composited over the card before judging (a naive
 * ratio on a translucent fill lies, `proseInkCorrection`'s own trap) and the caller re-emits it OPAQUE.
 *
 * The walk takes the page ink's side first and the other only if that side holds no fill: a fill on the ink's side leaves
 * the tone's tints the page's side, where the same ink reads on them, so the nearest lightness overall is not the answer. The corrected fill is the opaque sRGB pixel at that lightness, so the caller paints exactly
 * the colour this judged: an out-of-gamut chroma never reaches the CSS.
 *
 * `none` means NO lightness in `[fgLMin, fgLMax]` clears — a card that cannot carry this hue at all. Failing open
 * to the authored accent is the wrong behaviour, and inventing a colour is what this file exists not to do.
 */
export function accentFillLightness(accent: Oklch, accentAlpha: number, base: Oklch): AccentFill {
  const deltas = rampDeltas(base);
  const card = oklchToSrgb(rampSurface(base, deltas.card));
  // The neutral tint-active stands in for the tone's own tints, which sit a separation off every host: a glyph paints the fill on them.
  const tint = oklchToSrgb(rampSurface(base, deltas.accent));
  const clears = (fill: Rgb): boolean => Math.min(fillVsCardRatio(fill, card), fillVsCardRatio(fill, tint)) >= AA_NON_TEXT_RATIO;
  const opaque = oklchToSrgb(accent);
  if (clears(accentAlpha < 1 ? compositeSrgb(opaque, accentAlpha, card) : opaque)) {
    return { kind: "clears" };
  }
  const first = surfacePolarity(base) === "light" ? -1 : 1;
  const maxSteps = Math.round(Math.max(accent.l - THEME_DERIVATION.fgLMin, THEME_DERIVATION.fgLMax - accent.l) / ACCENT_L_STEP);
  for (const sign of [first, -first]) {
    for (let step = 1; step <= maxSteps; step += 1) {
      // Re-round: accent.l + n×0.001 accumulates binary-float dust that would reach the CSS literal.
      const l = Math.round((accent.l + sign * step * ACCENT_L_STEP) / ACCENT_L_STEP) * ACCENT_L_STEP;
      if (l < THEME_DERIVATION.fgLMin || l > THEME_DERIVATION.fgLMax) {
        continue;
      }
      // Judged OPAQUE at the re-derived lightness: the caller emits it opaque for the same reason the ink
      // clamp does — a minimal alpha sits on the boundary and re-judging it is a fixed point that never passes.
      const pixel = oklchToSrgb(onHue(l, accent.c, accent.h));
      if (clears(pixel)) {
        return { kind: "corrected", fill: srgbToOklch(pixel) };
      }
    }
  }
  return { kind: "none" };
}

/** The ink paired with a solid fill and its hover and active steps, and whether it covers the steps too. */
export interface SolidInk {
  readonly lightness: number;
  readonly coversSteps: boolean;
}

/**
 * The ink for a solid and its steps (D336). One ink over all three when one exists; else the fill's own ink at the
 * polarity that leaves the steps the most contrast, so the clamp raises the step knobs toward the fill until the
 * floor holds. A single surface always admits an ink above AA (black or white reaches √21 against any pixel).
 */
export function solidInkLightness(fill: Oklch, steps: readonly Oklch[]): SolidInk {
  const family = familyForegroundLightness([fill, ...steps]);
  if (family !== null) {
    return { lightness: family, coversSteps: true };
  }
  const fillRgb = oklchToSrgb(fill);
  const candidates = SURFACE_POLARITIES.flatMap((polarity) => {
    const endpoint = oklchToSrgb({ l: polarity === "light" ? 0 : 1, c: 0, h: fill.h });
    const target = Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstTextContrast(endpoint, [fillRgb])));
    const lightness = tryNeutralInkLightness(polarity, [fillRgb], polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax, target);
    if (lightness === null) {
      return [];
    }
    const ink = oklchToSrgb({ l: lightness, c: 0, h: fill.h });
    return [
      {
        lightness,
        stepsMin: worstTextContrast(
          ink,
          steps.map((step) => oklchToSrgb(step)),
        ),
      },
    ];
  });
  const best = candidates.reduce<(typeof candidates)[number] | undefined>(
    (winner, candidate) => (winner === undefined || candidate.stepsMin > winner.stepsMin ? candidate : winner),
    undefined,
  );
  if (best === undefined) {
    throw new Error("unable to derive a contrast-safe ink for a solid fill");
  }
  return { lightness: best.lightness, coversSteps: false };
}
/**
 * The operands a D336 tone-role mix moves toward. `away` is `light-dark(black, white)`: the solid steps move away from the
 * page ink. `host` is the surface under the role, `var(--tone-host, var(--color-background))`: a wash mixes over the card or
 * popover it sits on, so it stays apart from that surface rather than from the page.
 */
export const TONE_MIX_TARGETS = ["foreground", "background", "host", "away"] as const;
type ToneMixTarget = (typeof TONE_MIX_TARGETS)[number];

/** What a colored tone's role starts from: its intent base or the base's paired foreground token. */
export const COLORED_TONE_ORIGINS = ["base", "base-foreground"] as const;
type ColoredToneOrigin = (typeof COLORED_TONE_ORIGINS)[number];

/** One `color-mix(in oklab, <origin> var(--tone-mix-<mix>), <toward>)` step. */
interface ToneMixStep<Knob extends string> {
  readonly mix: Knob;
  readonly toward: ToneMixTarget;
}

/** A surface a role's ink must clear AA on: a sibling role of the same tone, or a palette host. */
type ToneFloorSurface<Role extends string, Host extends string> = { readonly role: Role } | { readonly host: Host };

/**
 * One D336 role, as data: the token vault authors it and the generated token map carries it, so the build, the
 * ThemeScope clamp and the tests evaluate the same recipe the `[data-tone]` blocks spell.
 */
export interface ToneRoleRecipe<Role extends string, Knob extends string, Host extends string> {
  readonly colored: ColoredToneOrigin | ToneMixStep<Knob>;
  /** The neutral tone binds the derived ramp (D202 keeps its inks solved); a step mixes that host further. */
  readonly neutral: { readonly bind: Host; readonly step?: ToneMixStep<Knob>; readonly pageInks: readonly Host[] };
  readonly floor: readonly ToneFloorSurface<Role, Host>[];
  /**
   * Page-family host inks a colored tone's role carries at the text floor: a selected row, an active tab or a compare panel
   * keeps its page inks on a tint. The neutral tone binds the ramp, whose inks D202 solves, so it is not judged here.
   */
  readonly pageInks: readonly Host[];
}

/**
 * Every surface a role pairs with at the text floor for one tone: its floor, and its page inks when the tone is colored,
 * each as the ink the palette's host paints it in.
 */
function roleFloors<Role extends string, Knob extends string, Host extends string>(
  recipe: ToneRoleRecipe<Role, Knob, Host>,
  tone: ToneSource,
  palette: TonePalette<Host>,
): readonly ToneFloorSurface<Role, Host>[] {
  if (palette.carriesPageInks === false) {
    return recipe.floor;
  }
  const inks = tone === "neutral" ? recipe.neutral.pageInks : recipe.pageInks;
  return [...recipe.floor, ...inks.map((host) => ({ host: palette.hostInks?.[host] ?? host }))];
}

export type ToneRoleRecipes<Role extends string, Knob extends string, Host extends string> = Readonly<Record<Role, ToneRoleRecipe<Role, Knob, Host>>>;

/** The scope colours a tone resolves against: its polarity (the arm `light-dark()` takes) and its ramp hosts. */
export type TonePalette<Host extends string> = {
  readonly polarity: SurfacePolarity;
  readonly foreground: Oklch;
  readonly background: Oklch;
  /** The surface a `host` mix moves toward: the page, unless a surface sets `--tone-host` ({@link tonePaletteOn}). */
  readonly host: Oklch;
  readonly hosts: Readonly<Record<Host, Oklch>>;
} & (
  | { readonly carriesPageInks: false; readonly hostInks?: never }
  | { readonly carriesPageInks?: true; readonly hostInks?: Readonly<Partial<Record<Host, Host>>> }
);

/** The ramp hosts a carried palette derives and a tone recipe may bind or floor over. */
export const CARRIED_TONE_HOSTS = [
  "background",
  "foreground",
  "surface-raised",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "sidebar",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "user-bubble",
  "ai-bubble",
  "system-bubble",
] as const;
export type CarriedToneHost = (typeof CARRIED_TONE_HOSTS)[number];

/**
 * The surfaces a tone wash sits over, each of which a surface primitive names through its `tone-host-<host>` utility.
 * Every floor and every tint separation is judged over each, by the token build for a seed and by the clamp for a carried palette.
 * A message bubble is a host per role: a seed's bubble fills differ from the ramp's, and a bubble holds the transcript's tokens.
 */
export const TONE_HOSTS = [
  "background",
  "surface-raised",
  "card",
  "popover",
  "user-bubble",
  "ai-bubble",
  "system-bubble",
] as const satisfies readonly CarriedToneHost[];
export type ToneHost = (typeof TONE_HOSTS)[number];

/** The ink each host paints its content in: a row on a card's tint keeps the card's ink, on a popover's the popover's. */
const TONE_HOST_INKS: Readonly<Partial<Record<ToneHost, CarriedToneHost>>> = {
  background: "foreground",
  "surface-raised": "foreground",
  card: "card-foreground",
  popover: "popover-foreground",
};

/**
 * The palette on one host: its `host` operand on that surface, and its `foreground` page ink the ink that surface paints,
 * so a tint's page-ink floor is judged as the pair that host actually draws. A bubble host has no page inks to judge.
 */
export function tonePaletteOn(palette: TonePalette<CarriedToneHost>, host: ToneHost): TonePalette<CarriedToneHost> {
  const ink = TONE_HOST_INKS[host];
  if (ink === undefined || palette.carriesPageInks === false) {
    const { hostInks: _pageInks, ...surface } = palette;
    return { ...surface, host: palette.hosts[host], carriesPageInks: false };
  }
  return { ...palette, host: palette.hosts[host], hostInks: { foreground: ink } };
}

/** The panels a form control sits on, each of which the input wash composites over. */
function fieldPanels(base: Oklch, deltas: RampDeltas): readonly Oklch[] {
  return [base, rampSurface(base, deltas.surfaceRaised), rampSurface(base, deltas.card), rampSurface(base, deltas.popover), rampSurface(base, deltas.sidebar)];
}

/** A carried palette's low-emphasis ink and the input wash it clears, judged over the hosts that ink is painted on. */
function carriedMutedForegroundPair(base: Oklch): MutedForegroundPair {
  const deltas = rampDeltas(base);
  const panels = fieldPanels(base, deltas);
  const hosts = [...panels, rampSurface(base, deltas.secondary), rampSurface(base, deltas.muted), rampSurface(base, deltas.accent)];
  return derivedMutedForegroundPair(base, hosts, panels);
}

function opaquePixel(color: Oklch): Oklch {
  return srgbToOklch(oklchToSrgb(color));
}

/**
 * The shared ink of the page family, the popover and rail a tone's text mixes it into included, of a field's value on the
 * input wash over each panel, and of a row that keeps this ink on a neutral tint. A carried palette has no call-site sweep
 * to lean on, and `rampDeltas` holds every one of them where the polarity's end point clears it.
 */
function carriedForegroundLightness(base: Oklch, inputWash: number): number {
  const deltas = rampDeltas(base);
  const wash = oklchToSrgb({ l: inputWash, c: 0, h: base.h });
  const fields = fieldPanels(base, deltas).map((panel) => compositeSrgb(wash, THEME_DERIVATION.inputAlpha, oklchToSrgb(panel)));
  return derivedForegroundLightnessForSurfaces(
    [
      base,
      rampSurface(base, deltas.surfaceRaised),
      rampSurface(base, deltas.card),
      rampSurface(base, deltas.popover),
      rampSurface(base, deltas.sidebar),
      rampSurface(base, deltas.accent),
      rampSurface(base, deltas.muted),
    ],
    fields,
  );
}

/**
 * The ink of one ramp member `rampDeltas` projected, at the base's polarity (D202). The projection holds that end point on
 * the member, so the member needs no polarity of its own: a member a hair across the crossover would otherwise take the
 * opposite ink from the page, and no tint could carry both.
 */
function rampMemberInkLightness(base: Oklch, surface: Oklch): number {
  const polarity = surfacePolarity(base);
  const surfaceRgb = oklchToSrgb(surface);
  return neutralInkLightness(
    polarity,
    [surfaceRgb],
    polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax,
    neutralInkTarget(polarity, surfaceRgb),
  );
}

/** The accent ink covers the accent and muted host family: it is the neutral tone's text on both of its tints (D336). */
function carriedAccentInkLightness(base: Oklch): number {
  const deltas = rampDeltas(base);
  const lightness = familyForegroundLightness([rampSurface(base, deltas.accent), rampSurface(base, deltas.muted)]);
  if (lightness === null) {
    // rampDeltas retracts the accent until this family clears, so a miss here is a derivation defect.
    throw new Error("unable to derive a contrast-safe accent foreground for the accent and muted family");
  }
  return lightness;
}

/**
 * One neutral ink for a host family whose members can straddle the black/white crossover (a fill and its hover
 * steps, or an unprojected accent beside muted). The anchor's endpoint is tried first, then the other; `null`
 * when neither endpoint clears every member, which near the crossover is physics rather than a search miss.
 */
export function familyForegroundLightness(family: readonly Oklch[]): number | null {
  const [anchor] = family;
  if (anchor === undefined) {
    throw new Error("a foreground family needs at least one surface");
  }
  const surfaces = family.map((surface) => oklchToSrgb(surface));
  const first = surfacePolarity(anchor);
  for (const polarity of [first, first === "light" ? "dark" : "light"] as const) {
    const endpoint = oklchToSrgb({ l: polarity === "light" ? 0 : 1, c: 0, h: anchor.h });
    const target = Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstTextContrast(endpoint, surfaces)));
    const lightness = tryNeutralInkLightness(polarity, surfaces, polarity === "light" ? THEME_DERIVATION.fgLMin : THEME_DERIVATION.fgLMax, target);
    if (lightness !== null) {
      return lightness;
    }
  }
  return null;
}

/** The surfaces a carried palette's prose is read on: the page, a card, and the fill each message bubble paints. */
export function carriedReadingHosts(base: Oklch): readonly Oklch[] {
  const { user, ai, system } = bubbleFills(base);
  return [base, rampSurface(base, rampDeltas(base).card), bubbleFillColor(base, user), bubbleFillColor(base, ai), bubbleFillColor(base, system)];
}

/** The neutral inks a carried base solves: each is a search, so a caller solves them once and hands them to every derivation. */
export interface CarriedInks {
  /** The page ink over the background, raised and card family. */
  readonly foreground: number;
  /** The ink of the accent and muted family, the neutral tone's text on its tints. */
  readonly accentForeground: number;
  readonly cardForeground: number;
  readonly popoverForeground: number;
  readonly secondaryForeground: number;
  readonly muted: MutedForegroundPair;
}

export function carriedInks(base: Oklch): CarriedInks {
  const muted = carriedMutedForegroundPair(base);
  const deltas = rampDeltas(base);
  return {
    foreground: carriedForegroundLightness(base, muted.inputWash),
    accentForeground: carriedAccentInkLightness(base),
    cardForeground: rampMemberInkLightness(base, rampSurface(base, deltas.card)),
    popoverForeground: rampMemberInkLightness(base, rampSurface(base, deltas.popover)),
    secondaryForeground: rampMemberInkLightness(base, rampSurface(base, deltas.secondary)),
    muted,
  };
}

/** The painted pixels of a carried base's ramp hosts, the palette its tone roles resolve against; `inks` are {@link carriedInks} of the base. */
export function carriedTonePalette(base: Oklch, inks: CarriedInks): TonePalette<CarriedToneHost> {
  const deltas = rampDeltas(base);
  const bubbles = bubbleFills(base);
  const polarity = surfacePolarity(base);
  const background = opaquePixel(base);
  const foreground = opaquePixel({ l: inks.foreground, c: 0, h: base.h });
  const borderInk = oklchToSrgb({ l: derivedForegroundLightness(base), c: 0, h: base.h });
  return {
    polarity,
    foreground,
    background,
    host: background,
    hosts: {
      background,
      foreground,
      "surface-raised": opaquePixel(rampSurface(base, deltas.surfaceRaised)),
      card: opaquePixel(rampSurface(base, deltas.card)),
      "card-foreground": opaquePixel({ l: inks.cardForeground, c: 0, h: base.h }),
      popover: opaquePixel(rampSurface(base, deltas.popover)),
      "popover-foreground": opaquePixel({ l: inks.popoverForeground, c: 0, h: base.h }),
      sidebar: opaquePixel(rampSurface(base, deltas.sidebar)),
      muted: opaquePixel(rampSurface(base, deltas.muted)),
      "muted-foreground": opaquePixel({ l: inks.muted.lightness, c: 0, h: base.h }),
      accent: opaquePixel(rampSurface(base, deltas.accent)),
      "accent-foreground": opaquePixel({ l: inks.accentForeground, c: 0, h: base.h }),
      border: srgbToOklch(compositeSrgb(borderInk, THEME_DERIVATION.borderAlpha, oklchToSrgb(base))),
      // A bubble's fill is the ramp member the base token binds it to (`user-bubble` to secondary, `ai-bubble` to card,
      // `system-bubble` to muted); a scope that picks a bubble fill is not judged on the pick.
      "user-bubble": bubbleFillColor(base, bubbles.user),
      "ai-bubble": bubbleFillColor(base, bubbles.ai),
      "system-bubble": bubbleFillColor(base, bubbles.system),
    },
  };
}

/** Lightness step of the form-control edge scan: fine enough that the first passing step sits within a tenth of a ratio point of the floor. */
const INPUT_BORDER_L_STEP = 0.005;

/** A fill a form control paints inside its edge: an ink at an alpha, composited over each panel the control sits on. */
interface InputBorderFill {
  readonly ink: Oklch;
  readonly alpha: number;
}

/** What the scope paints a form-control edge over: its chrome panels, and every fill a control paints, each laid over every panel. */
interface InputBorderGrounds {
  readonly panels: readonly Oklch[];
  readonly fills: readonly InputBorderFill[];
}

export interface InputBorderSolve {
  readonly edge: Oklch;
  /** False when the scan ran out of lightness before the 3:1 floor held on every ground. */
  readonly floorMet: boolean;
}

export interface InputBorderInputs {
  readonly base: Oklch;
  /** The scope's ink lightness: the edge walks from the base toward it. */
  readonly inkLightness: number;
  readonly grounds: InputBorderGrounds;
}

function quantizedPixel(color: Oklch): Rgb {
  return quantized(oklchToSrgb(color));
}

/**
 * The form-control edge of a carried palette (D159): the nearest lightness to the base, on either side,
 * at which the edge holds WCAG 1.4.11's 3:1 against every panel and against each painted fill over each, measured on
 * 8-bit pixels. The nearest passing step is the quietest edge, so it is also the one furthest below the focus ring.
 * The focus ring is held above this edge afterwards, by {@link solveFocusRing}; the floor is never traded for it.
 */
export function solveInputBorder({ base, inkLightness, grounds }: InputBorderInputs): InputBorderSolve {
  const preferred = inkLightness > base.l ? 1 : -1;
  const panelPixels = grounds.panels.map((panel) => quantizedPixel(panel));
  const seen = [
    ...panelPixels,
    ...grounds.fills.flatMap(({ ink, alpha }) => panelPixels.map((panel) => quantized(compositeSrgb(oklchToSrgb(ink), alpha, panel)))),
  ];
  const steps = Math.round(1 / INPUT_BORDER_L_STEP);
  // Both directions are walked together: around the polarity pivot the fill's own ink can darken the grounds so far that
  // the scope's ink side holds no 3:1 edge while the far side does. The nearest passing step wins; a tie takes the ink side.
  for (let step = 0; step <= steps; step += 1) {
    for (const direction of [preferred, -preferred]) {
      const l = base.l + direction * step * INPUT_BORDER_L_STEP;
      if (l < 0 || l > 1) {
        continue;
      }
      const candidate: Oklch = { l, c: 0, h: base.h };
      const pixel = quantizedPixel(candidate);
      if (seen.every((ground) => wcagContrastRatio(pixel, ground) >= AA_NON_TEXT_RATIO)) {
        return { edge: candidate, floorMet: true };
      }
    }
  }
  // No lightness holds the floor: paint the scope's ink, the strongest edge it owns.
  const edge: Oklch = { l: inkLightness, c: 0, h: base.h };
  return { edge, floorMet: false };
}

/** The ratio on the card a ring should clear the edge by: a target the solve aims for, not a gate. Focus must out-shout rest by more than quantization noise. */
export const RING_OVER_EDGE_MARGIN = 0.25;

export interface FocusRingInputs {
  /** The ring the scope would paint: the accent fill. Its hue and chroma are kept. */
  readonly ring: Oklch;
  readonly edge: Oklch;
  readonly card: Oklch;
}

/**
 * The focus ring that out-shouts the resting edge (D159's ceiling) under a carried scope: the ring's own hue and chroma at
 * the nearest lightness whose ratio on the card is at least 3:1 and above the edge's by {@link RING_OVER_EDGE_MARGIN}.
 * A ring already above the edge by the margin is returned unchanged. When no lightness reaches the margin, the best ring on
 * the hue is returned if it still sits above the edge; `null` only when no ring on the hue does.
 */
export function solveFocusRing({ ring, edge, card }: FocusRingInputs): Oklch | null {
  const cardPixel = quantizedPixel(card);
  const edgeRatio = wcagContrastRatio(quantizedPixel(edge), cardPixel);
  const target = Math.max(AA_NON_TEXT_RATIO, edgeRatio + RING_OVER_EDGE_MARGIN);
  let best = { color: ring, ratio: wcagContrastRatio(quantizedPixel(ring), cardPixel) };
  if (best.ratio >= target) {
    return ring;
  }
  const steps = Math.round(1 / INPUT_BORDER_L_STEP);
  for (let step = 1; step <= steps; step += 1) {
    for (const direction of [1, -1]) {
      // Clamped, so the extremes (white, black on this hue) are tried exactly rather than skipped by float dust.
      const l = Math.min(1, Math.max(0, ring.l + direction * step * INPUT_BORDER_L_STEP));
      const pixel = oklchToSrgb({ l, c: ring.c, h: ring.h });
      const ratio = wcagContrastRatio({ r: Math.round(pixel.r), g: Math.round(pixel.g), b: Math.round(pixel.b) }, cardPixel);
      if (ratio >= target) {
        return srgbToOklch(pixel);
      }
      if (ratio > best.ratio) {
        best = { color: srgbToOklch(pixel), ratio };
      }
    }
  }
  return best.ratio > edgeRatio ? best.color : null;
}

/** A colored tone's two authored colours: the intent base and its `-foreground` token, at the palette's polarity. */
export interface ToneColors {
  readonly base: Oklch;
  readonly foreground: Oklch;
}

/** The neutral tone has no colours of its own: it binds the palette's ramp. */
export type ToneSource = ToneColors | "neutral";

const PERCENT = 100;

function toOklab({ l, c, h }: Oklch): readonly [number, number, number] {
  const radians = h / DEGREES_PER_RADIAN;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
}

/** `color-mix(in oklab, origin <percent>%, toward)` for two opaque colours, returned in OKLCH. */
export function mixOklab(origin: Oklch, percent: number, toward: Oklch): Oklch {
  const weight = percent / PERCENT;
  const [l1, a1, b1] = toOklab(origin);
  const [l2, a2, b2] = toOklab(toward);
  const a = a1 * weight + a2 * (1 - weight);
  const b = b1 * weight + b2 * (1 - weight);
  const hue = (((Math.atan2(b, a) * DEGREES_PER_RADIAN) % HUE_WHEEL_DEGREES) + HUE_WHEEL_DEGREES) % HUE_WHEEL_DEGREES;
  return { l: l1 * weight + l2 * (1 - weight), c: Math.hypot(a, b), h: hue };
}

const BLACK: Oklch = { l: 0, c: 0, h: 0 };
const WHITE: Oklch = { l: 1, c: 0, h: 0 };

function mixTarget<Host extends string>(target: ToneMixTarget, palette: TonePalette<Host>): Oklch {
  switch (target) {
    case "foreground":
      return palette.foreground;
    case "background":
      return palette.background;
    case "host":
      return palette.host;
    case "away":
      return palette.polarity === "light" ? BLACK : WHITE;
    default: {
      const exhaustive: never = target;
      throw new Error(`unknown tone mix target ${String(exhaustive)}`);
    }
  }
}

function mixStep<Knob extends string, Host extends string>(
  origin: Oklch,
  step: ToneMixStep<Knob>,
  palette: TonePalette<Host>,
  mix: Readonly<Record<Knob, number>>,
): Oklch {
  return mixOklab(origin, mix[step.mix], mixTarget(step.toward, palette));
}

/** A tone recipe set and the palette it resolves against: what every evaluation below reads. */
export interface ToneScheme<Role extends string, Knob extends string, Host extends string> {
  readonly recipes: ToneRoleRecipes<Role, Knob, Host>;
  readonly palette: TonePalette<Host>;
}

function roleColor<Role extends string, Knob extends string, Host extends string>(
  { palette }: ToneScheme<Role, Knob, Host>,
  recipe: ToneRoleRecipe<Role, Knob, Host>,
  tone: ToneSource,
  mix: Readonly<Record<Knob, number>>,
): Oklch {
  if (tone === "neutral") {
    const bound = palette.hosts[recipe.neutral.bind];
    return recipe.neutral.step === undefined ? bound : mixStep(bound, recipe.neutral.step, palette, mix);
  }
  if (recipe.colored === "base") {
    return tone.base;
  }
  if (recipe.colored === "base-foreground") {
    return tone.foreground;
  }
  return mixStep(tone.base, recipe.colored, palette, mix);
}

/** Every role of one tone, evaluated the way the generated `[data-tone]` block spells it. */
export function toneRoleColors<Role extends string, Knob extends string, Host extends string>(
  scheme: ToneScheme<Role, Knob, Host>,
  tone: ToneSource,
  mix: Readonly<Record<Knob, number>>,
): Readonly<Record<Role, Oklch>> {
  const roles = Object.keys(scheme.recipes) as Role[];
  return Object.fromEntries(roles.map((role) => [role, roleColor(scheme, scheme.recipes[role], tone, mix)])) as Record<Role, Oklch>;
}

/** The WCAG ratio a role pair paints: the worse of the float colour and the 8-bit framebuffer pixel. */
export function toneContrast(ink: Oklch, surface: Oklch): number {
  return worstTextContrast(oklchToSrgb(ink), [oklchToSrgb(surface)]);
}

/** One D336 floor a role pair misses. */
export interface ToneFloorMiss<Role extends string, Host extends string> {
  readonly role: Role;
  readonly over: ToneFloorSurface<Role, Host>;
  readonly ratio: number;
}

function stepKnob<Role extends string, Knob extends string, Host extends string>(recipe: ToneRoleRecipe<Role, Knob, Host>, tone: ToneSource): Knob | undefined {
  if (tone === "neutral") {
    return recipe.neutral.step?.mix;
  }
  return typeof recipe.colored === "string" ? undefined : recipe.colored.mix;
}

/** The knobs a floor's pair reads: its ink role's and, when the surface is a role, the surface's. */
function floorKnobs<Role extends string, Knob extends string, Host extends string>(
  recipes: ToneRoleRecipes<Role, Knob, Host>,
  role: Role,
  over: ToneFloorSurface<Role, Host>,
  tone: ToneSource,
): readonly Knob[] {
  const surfaceKnob = "role" in over ? stepKnob(recipes[over.role], tone) : undefined;
  return [stepKnob(recipes[role], tone), surfaceKnob].filter((knob): knob is Knob => knob !== undefined);
}

/**
 * Narrows a floor check: `knobs` keeps the floors whose pair reads one of them, `ignoring` then drops the floors whose
 * pair reads one of its knobs, and `ratio` replaces the legal floor.
 */
export interface ToneFloorFilter<Knob extends string> {
  readonly knobs?: ReadonlySet<Knob>;
  readonly ignoring?: ReadonlySet<Knob>;
  readonly ratio?: number;
}

/**
 * Every D336 floor one tone misses under `mix`, at {@link AA_NORMAL_RATIO} unless the filter names another ratio.
 * {@link solveToneMix} judges one knob group alone through the filter's `knobs`.
 */
export function toneFloorMisses<Role extends string, Knob extends string, Host extends string>(
  scheme: ToneScheme<Role, Knob, Host>,
  tone: ToneSource,
  mix: Readonly<Record<Knob, number>>,
  { knobs, ignoring, ratio = AA_NORMAL_RATIO }: ToneFloorFilter<Knob> = {},
): readonly ToneFloorMiss<Role, Host>[] {
  const judged = (role: Role, over: ToneFloorSurface<Role, Host>): boolean => {
    const read = floorKnobs(scheme.recipes, role, over, tone);
    return (knobs === undefined || read.some((knob) => knobs.has(knob))) && !(ignoring !== undefined && read.some((knob) => ignoring.has(knob)));
  };
  // A knob search judges a few pairs per candidate, so each role resolves only when a judged pair reads it.
  const resolved = new Map<Role, Oklch>();
  const colorOf = (role: Role): Oklch => {
    const known = resolved.get(role);
    if (known !== undefined) {
      return known;
    }
    const color = roleColor(scheme, scheme.recipes[role], tone, mix);
    resolved.set(role, color);
    return color;
  };
  return roleFloorMisses(scheme, tone, colorOf, { ratio, judged });
}

/** Narrows a {@link roleFloorMisses} judge: `ratio` replaces the legal floor, `judged` keeps a subset of the pairs. */
export interface RoleFloorJudge<Role extends string, Host extends string> {
  readonly ratio?: number;
  readonly judged?: (role: Role, over: ToneFloorSurface<Role, Host>) => boolean;
}

/**
 * Every D336 floor one tone's resolved role colours miss: the judge for colours a scope paints, whether its mixes
 * spelled them or it emitted them as literals ({@link solveCarriedToneRoles}). A colored tone's page inks count as floors.
 */
export function roleFloorMisses<Role extends string, Knob extends string, Host extends string>(
  scheme: ToneScheme<Role, Knob, Host>,
  tone: ToneSource,
  colorOf: (role: Role) => Oklch,
  { ratio = AA_NORMAL_RATIO, judged = (): boolean => true }: RoleFloorJudge<Role, Host> = {},
): readonly ToneFloorMiss<Role, Host>[] {
  const misses: ToneFloorMiss<Role, Host>[] = [];
  // The knob solves call this per candidate, and a role pairs with several grounds: resolve each colour's luminances once.
  const resolved = new Map<Oklch, Luminances>();
  const luminanceOf = (color: Oklch): Luminances => {
    const known = resolved.get(color);
    if (known !== undefined) {
      return known;
    }
    const converted = luminances(oklchToSrgb(color));
    resolved.set(color, converted);
    return converted;
  };
  for (const role of Object.keys(scheme.recipes) as Role[]) {
    for (const over of roleFloors(scheme.recipes[role], tone, scheme.palette)) {
      if (!judged(role, over)) {
        continue;
      }
      const measured = worstLuminanceContrast(luminanceOf(colorOf(role)), [luminanceOf("role" in over ? colorOf(over.role) : scheme.palette.hosts[over.host])]);
      if (measured < ratio) {
        misses.push({ role, over, ratio: measured });
      }
    }
  }
  return misses;
}

/**
 * Knobs the clamp solves together. A `lower` group's `scaled` knobs step down as one, each in proportion to its
 * default, so a tint keeps its step to its active twin; for each scaled candidate the `inner` knob takes the
 * largest percent at most its default that clears. A `raise` group moves its one knob up toward 100, the origin
 * itself, and takes the smallest percent that clears: the neutral solid steps mix toward the page, so only a
 * larger share of the solid restores its ink's contrast.
 */
export type ToneMixGroup<Knob extends string> =
  | { readonly direction: "lower"; readonly scaled: readonly Knob[]; readonly inner: Knob }
  | { readonly direction: "raise"; readonly inner: Knob };

/** The knob defaults and the groups the clamp solves them in. */
export interface ToneMixSolve<Knob extends string> {
  readonly defaults: Readonly<Record<Knob, number>>;
  readonly groups: readonly ToneMixGroup<Knob>[];
}

/** What one group search judges: the scheme, every tone it paints, and the contrast the search aims at. */
interface GroupSearch<Role extends string, Knob extends string, Host extends string> {
  readonly scheme: ToneScheme<Role, Knob, Host>;
  readonly tones: readonly ToneSource[];
  readonly ratio: number;
}

function groupClears<Role extends string, Knob extends string, Host extends string>(
  search: GroupSearch<Role, Knob, Host>,
  mix: Readonly<Record<Knob, number>>,
  filter: Pick<ToneFloorFilter<Knob>, "knobs" | "ignoring">,
): boolean {
  return search.tones.every((tone) => toneFloorMisses(search.scheme, tone, mix, { ...filter, ratio: search.ratio }).length === 0);
}

function raiseGroup<Role extends string, Knob extends string, Host extends string>(
  search: GroupSearch<Role, Knob, Host>,
  inner: Knob,
  solved: Record<Knob, number>,
): boolean {
  const knobs = new Set<Knob>([inner]);
  for (let percent = solved[inner]; percent <= PERCENT; percent += 1) {
    solved[inner] = percent;
    if (groupClears(search, solved, { knobs })) {
      return true;
    }
  }
  return false;
}

function lowerGroup<Role extends string, Knob extends string, Host extends string>(
  search: GroupSearch<Role, Knob, Host>,
  { scaled, inner }: { readonly scaled: readonly Knob[]; readonly inner: Knob },
  solved: Record<Knob, number>,
): boolean {
  const knobs = new Set<Knob>([...scaled, inner]);
  // The pairs that read only the scaled knobs, such as a page ink on a tint: no inner percent rescues a scale they miss.
  const scaledOnly = { knobs: new Set<Knob>(scaled), ignoring: new Set<Knob>([inner]) };
  const defaults = { ...solved };
  const [lead] = scaled;
  for (let leadPercent = lead === undefined ? 0 : defaults[lead]; leadPercent >= 0; leadPercent -= 1) {
    for (const knob of scaled) {
      solved[knob] = lead === undefined ? defaults[knob] : Math.round((defaults[knob] * leadPercent) / defaults[lead]);
    }
    if (!groupClears(search, solved, scaledOnly)) {
      continue;
    }
    for (let percent = defaults[inner]; percent >= 0; percent -= 1) {
      solved[inner] = percent;
      if (groupClears(search, solved, { knobs })) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The `--tone-mix-*` percents nearest each default that clear every floor of every tone over a carried palette
 * (D336). Amounts are whole percents. Each group first aims at the D202 derivation ratio, the margin the browser's
 * own colour arithmetic spends below the analytic pair; where the palette cannot reach that, it settles for the
 * legal floor. A lowered group ends at zero, where `text` is the scope's own foreground and a tint its host;
 * a raised group ends at 100, the solid itself; D202 solves both ends, so a palette that misses even there throws.
 */
export function solveToneMix<Role extends string, Knob extends string, Host extends string>(
  scheme: ToneScheme<Role, Knob, Host>,
  tones: readonly ToneSource[],
  { defaults, groups }: ToneMixSolve<Knob>,
): Readonly<Record<Knob, number>> {
  const solved: Record<Knob, number> = { ...defaults };
  for (const group of groups) {
    const settled = [AA_NORMAL_DERIVATION_RATIO, AA_NORMAL_RATIO].some((ratio) => {
      const attempt = { ...solved };
      const search = { scheme, tones, ratio };
      const cleared = group.direction === "raise" ? raiseGroup(search, group.inner, attempt) : lowerGroup(search, group, attempt);
      if (cleared) {
        Object.assign(solved, attempt);
      }
      return cleared;
    });
    if (!settled) {
      throw new Error(`no tone mix clears the D336 floors for knob ${group.inner}`);
    }
  }
  return solved;
}

/** The least OKLab distance a tint keeps from the page, and from another tone's tint unless the two hues are adjacent. */
export const TONE_TINT_SEPARATION = 0.02;

/** Two tones whose hues sit closer than this are hue-adjacent, so their tints are exempt from the pairwise separation. */
export const TONE_HUE_ADJACENT_DEGREES = 45;

// About one 8-bit step in OKLab at the mid lightnesses where tints sit: what quantizing two tints can spend of their separation.
const TINT_PIXEL_HEADROOM = 0.004;

// How far past the nearest ink-clearing tint a search looks for the solid's floor: a tint this far off is no longer the tone's tint, and an unreachable floor must not walk the whole range.
const TINT_MARK_SEARCH_STEPS = 1000;
// Every clamp render pays this search on a palette whose floor is out of reach, so it samples rather than walks. Odd, because the walk alternates sides.
const TINT_MARK_SEARCH_STRIDE = 3;

// A browser can round a pixel one level off the solve's own 8-bit reading, so a tint landing on the separation can paint just under it.
const TINT_ROUNDING_MARGIN = 0.001;

/**
 * The least chroma a tint keeps where its tone and the gamut allow: two tints at this chroma, one lightness and the
 * adjacency bound apart in hue sit {@link TONE_TINT_SEPARATION} apart after quantization, so non-adjacent tints never merge.
 */
export const TONE_TINT_MIN_CHROMA = (TONE_TINT_SEPARATION + TINT_PIXEL_HEADROOM) / (2 * Math.sin(TONE_HUE_ADJACENT_DEGREES / 2 / DEGREES_PER_RADIAN));

/** The Euclidean distance between two colours in OKLab. */
export function oklabDistance(a: Oklch, b: Oklch): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** A colour as it paints: its sRGB, the float colour that sRGB holds and its 8-bit pixel, converted once for many comparisons. */
interface PaintedForms {
  readonly srgb: Rgb;
  readonly opaque: Oklch;
  readonly framebuffer: Oklch;
}

// A tint search measures one candidate against every host, and every candidate against the same hosts: each colour
// object converts once. The colours are readonly, so an object's forms never go stale.
const PAINTED_FORMS = new WeakMap<Oklch, PaintedForms>();

function paintedForms(color: Oklch): PaintedForms {
  const known = PAINTED_FORMS.get(color);
  if (known !== undefined) {
    return known;
  }
  const srgb = oklchToSrgb(color);
  const forms = { srgb, opaque: srgbToOklch(srgb), framebuffer: srgbToOklch(quantized(srgb)) };
  PAINTED_FORMS.set(color, forms);
  return forms;
}

function formsDistance(a: PaintedForms, b: PaintedForms): number {
  return Math.min(oklabDistance(a.opaque, b.opaque), oklabDistance(a.framebuffer, b.framebuffer));
}

/** The OKLab distance two colours paint at: the worse of the float colours and their 8-bit pixels. */
export function paintedDistance(a: Oklch, b: Oklch): number {
  return formsDistance(paintedForms(a), paintedForms(b));
}

/** The least painted OKLab distance a message bubble's fill keeps from the page, so the bubble style reads as a bubble. */
export const BUBBLE_PAGE_SEPARATION = 0.02;

/** The three bubble roles, each a {@link CarriedToneHost}. */
export const BUBBLE_HOSTS = ["user-bubble", "ai-bubble", "system-bubble"] as const satisfies readonly CarriedToneHost[];
export type BubbleHost = (typeof BUBBLE_HOSTS)[number];

/** One bubble role's fill and how far it paints from the page. */
export interface BubblePageMiss {
  readonly host: BubbleHost;
  readonly distance: number;
}

// A bubble fill moves away from the page one two-hundredth of the lightness range at a time.
const BUBBLE_DELTA_STEP = 0.005;

/**
 * One bubble role's fill as an offset from the base: a lightness `delta`, at the base's chroma unless `neutral`. A base so
 * saturated that every lightness paints the same pixel can only be left through a neutral fill.
 */
interface BubbleFill {
  readonly delta: number;
  readonly neutral: boolean;
}

/** A carried base's three bubble fills. */
export interface BubbleFills {
  readonly user: BubbleFill;
  readonly ai: BubbleFill;
  readonly system: BubbleFill;
}

/** The colour a {@link BubbleFill} paints on a base. */
function bubbleFillColor(base: Oklch, { delta, neutral }: BubbleFill): Oklch {
  const fill = rampSurface(base, delta);
  return opaquePixel(neutral ? { ...fill, c: 0 } : fill);
}

/**
 * The fill a ramp member keeps as a bubble: its own when it paints {@link BUBBLE_PAGE_SEPARATION} off the page, else the
 * nearest offset that does, on the polarity's side of the page first, where the page's prose ink only gains contrast, and
 * then the other, and then neutral.
 */
function bubbleFillApart(base: Oklch, host: BubbleHost, rampDelta: number): BubbleFill {
  const page = opaquePixel(base);
  const apart = (fill: BubbleFill): boolean => bubblePageMisses(page, { [host]: bubbleFillColor(base, fill) }).length === 0;
  const steps = Math.round(1 / BUBBLE_DELTA_STEP);
  for (const neutral of [false, true]) {
    const own = { delta: rampDelta, neutral };
    if (apart(own)) {
      return own;
    }
    for (const side of surfacePolarity(base) === "light" ? [1, -1] : [-1, 1]) {
      for (let step = 1; step <= steps; step += 1) {
        const fill = { delta: side * step * BUBBLE_DELTA_STEP, neutral };
        if (apart(fill)) {
          return fill;
        }
      }
    }
  }
  throw new Error("unable to derive a bubble fill that keeps its separation from the page");
}

/** The fills a carried base paints its three bubbles at: the ramp members they bind, moved apart from the page where one sits too close. */
export function bubbleFills(base: Oklch): BubbleFills {
  const deltas = rampDeltas(base);
  return {
    user: bubbleFillApart(base, "user-bubble", deltas.secondary),
    ai: bubbleFillApart(base, "ai-bubble", deltas.card),
    system: bubbleFillApart(base, "system-bubble", deltas.muted),
  };
}

/** The lightness of the one ink that covers a picked bubble fill and its inset step, which inline code paints on. */
export function bubbleInsetForeground(fill: Oklch): number {
  return derivedForegroundLightnessForSurfaces([fill, rampSurface(fill, rampDeltas(fill).muted)]);
}

/** The bubble roles whose fill paints closer to the page than {@link BUBBLE_PAGE_SEPARATION}. */
export function bubblePageMisses(page: Oklch, fills: Readonly<Partial<Record<BubbleHost, Oklch>>>): readonly BubblePageMiss[] {
  return BUBBLE_HOSTS.flatMap((host) => {
    const fill = fills[host];
    const distance = fill === undefined ? Number.POSITIVE_INFINITY : paintedDistance(fill, page);
    return distance < BUBBLE_PAGE_SEPARATION ? [{ host, distance }] : [];
  });
}

// Linear channels within this of 0–1 count as in gamut: the bisection below converges onto the boundary from inside.
const GAMUT_EPSILON = 1e-7;
const CHROMA_BISECTIONS = 24;

function inSrgbGamut(color: Oklch): boolean {
  return linearSrgb(color).every((channel) => channel >= -GAMUT_EPSILON && channel <= 1 + GAMUT_EPSILON);
}

/** The pixel at lightness `l` on hue `h`, at chroma `c` or the most the sRGB gamut holds there, whichever is less. */
function onHue(l: number, c: number, h: number): Oklch {
  return opaquePixel({ l, c: gamutChroma(l, c, h), h });
}

/** Chroma `c`, or the most the sRGB gamut holds at `l` and `h`: clipping past it moves the hue. */
function gamutChroma(l: number, c: number, h: number): number {
  // Black and white hold no chroma, so the search's end points are exactly the achromatic inks.
  if (l <= 0 || l >= 1) {
    return 0;
  }
  if (inSrgbGamut({ l, c, h })) {
    return c;
  }
  let inside = 0;
  let outside = c;
  for (let bisection = 0; bisection < CHROMA_BISECTIONS; bisection += 1) {
    const middle = (inside + outside) / 2;
    if (inSrgbGamut({ l, c: middle, h })) {
      inside = middle;
    } else {
      outside = middle;
    }
  }
  return inside;
}

const ROLE_L_STEP = 0.001;
const ROLE_L_STEPS = Math.round(1 / ROLE_L_STEP);
// A pixel round trip moves chroma by less than this; a tint within it of its floor holds the floor.
const CHROMA_TOLERANCE = 0.001;

/** The lightnesses a role search tries, nearest first: the start, then outward a step at a time, `first` before the other side. */
function* lightnessWalk(start: number, first: 1 | -1): Generator<number> {
  yield start;
  for (let step = 1; step <= ROLE_L_STEPS; step += 1) {
    for (const sign of [first, -first]) {
      // Re-rounded so the lightness reaching the CSS literal carries no accumulated float dust.
      const l = Math.round((start + sign * step * ROLE_L_STEP) / ROLE_L_STEP) * ROLE_L_STEP;
      if (l >= 0 && l <= 1) {
        yield l;
      }
    }
  }
}

/** The lightness walk a tint search takes: every step, then a bounded sample once a tint has cleared its inks but missed the solid's floor. */
function* tintLightnessWalk(start: number, first: 1 | -1, unmarked: () => boolean): Generator<number> {
  let past = 0;
  for (const l of lightnessWalk(start, first)) {
    if (!unmarked()) {
      yield l;
      continue;
    }
    past += 1;
    if (past > TINT_MARK_SEARCH_STEPS) {
      return;
    }
    if (past % TINT_MARK_SEARCH_STRIDE === 0) {
      yield l;
    }
  }
}

function mixStepToward<Knob extends string>(colored: ColoredToneOrigin | ToneMixStep<Knob>, target: ToneMixTarget): ToneMixStep<Knob> | undefined {
  return typeof colored === "object" && colored.toward === target ? colored : undefined;
}

interface LiteralRole<Role extends string, Knob extends string> {
  readonly role: Role;
  readonly step: ToneMixStep<Knob>;
}

/** The tints: mixed toward the host and the ground of another role's floor, weakest first. A carried scope emits them literally. */
function literalSurfaces<Role extends string, Knob extends string, Host extends string>(
  recipes: ToneRoleRecipes<Role, Knob, Host>,
  defaults: Readonly<Record<Knob, number>>,
): readonly LiteralRole<Role, Knob>[] {
  const roles = Object.keys(recipes) as Role[];
  const grounds = new Set(roles.flatMap((role) => recipes[role].floor.flatMap((over) => ("role" in over ? [over.role] : []))));
  return roles
    .flatMap((role) => {
      const step = mixStepToward(recipes[role].colored, "host");
      return step !== undefined && grounds.has(role) ? [{ role, step }] : [];
    })
    .toSorted((a, b) => defaults[a.step.mix] - defaults[b.step.mix]);
}

/** The inks a carried scope emits literally: mixed toward the page ink and judged by a floor. */
function literalInks<Role extends string, Knob extends string, Host extends string>(
  recipes: ToneRoleRecipes<Role, Knob, Host>,
): readonly LiteralRole<Role, Knob>[] {
  return (Object.keys(recipes) as Role[]).flatMap((role) => {
    const step = mixStepToward(recipes[role].colored, "foreground");
    return step !== undefined && recipes[role].floor.length > 0 ? [{ role, step }] : [];
  });
}

/**
 * The colored-tone roles a carried scope emits as literals (D336): the page-relative mixes a floor judges. A
 * `color-mix()` toward a fixed page colour scales the tone's chroma down with every percent it gives up, so on a
 * mid-lightness page a floor reached by mixing leaves no hue; a literal keeps the hue and solves the lightness.
 */
export function carriedLiteralRoles<Role extends string, Knob extends string, Host extends string>(
  recipes: ToneRoleRecipes<Role, Knob, Host>,
  defaults: Readonly<Record<Knob, number>>,
): readonly Role[] {
  return [...literalSurfaces(recipes, defaults), ...literalInks(recipes)].map(({ role }) => role);
}

interface TintSpec {
  readonly percent: number;
  readonly weakestPercent: number;
  /** The inks the tone's tint carries, each of which must clear the text floor on it. */
  readonly inks: readonly Oklch[];
  /** The surfaces the tint may sit over ({@link TONE_HOSTS}), each of which it keeps the separation from. */
  readonly hosts: readonly Oklch[];
  /** The tone's solid, which a glyph paints on this tint (an active rail cell): held at the non-text floor where the tint can reach it. */
  readonly mark: Oklch;
}

/**
 * A tint on the tone's hue: the default mix's lightness and the tone's share of chroma, raised to the tint's least
 * chroma (scaled by its step over the weakest tint, so a stronger tint stays stronger). The nearest lightness, away
 * from the page ink first, that keeps that chroma, sits {@link TONE_TINT_SEPARATION} off every host and lets each ink of
 * its floor clear the text floor wins; where the gamut holds no such chroma, the nearest that keeps the rest. One literal
 * serves every host, so it is judged against each.
 *
 * The inks are the page-family inks a selected row, an active tab or a compare panel keep on a tint (D336). Each aims at
 * its own pair with the page, capped at the derivation ratio and never below the floor; the page ink's end point clears
 * whatever those inks clear, so `text-on-tint` always has a solution too. The tone's solid on the tint holds
 * {@link AA_NON_TEXT_RATIO} when a candidate does; the inks outrank it, so where none does the nearest that keeps them wins.
 */
function solveTint<Host extends string>(palette: TonePalette<Host>, base: Oklch, { percent, weakestPercent, inks, hosts, mark }: TintSpec): Oklch {
  const { background, foreground } = palette;
  const floorChroma = Math.min(base.c, (TONE_TINT_MIN_CHROMA * percent) / weakestPercent);
  const chroma = Math.max((base.c * percent) / PERCENT, floorChroma);
  const aims = inks.map((ink) => ({
    ink: luminances(oklchToSrgb(ink)),
    aim: Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, toneContrast(ink, background))),
  }));
  const markLuminance = luminances(oklchToSrgb(mark));
  let nearest: Oklch | undefined;
  let unmarked: Oklch | undefined;
  const keepsFloors = (candidate: Oklch): boolean => {
    const pixel = [luminances(paintedForms(candidate).srgb)];
    return (
      hosts.every((host) => paintedDistance(candidate, host) >= TONE_TINT_SEPARATION + TINT_ROUNDING_MARGIN) &&
      aims.every(({ ink, aim }) => worstLuminanceContrast(ink, pixel) >= aim)
    );
  };
  const holdsMark = (candidate: Oklch): boolean => worstLuminanceContrast(markLuminance, [luminances(paintedForms(candidate).srgb)]) >= AA_NON_TEXT_RATIO;
  for (const l of tintLightnessWalk(mixOklab(base, percent, background).l, foreground.l < background.l ? 1 : -1, () => unmarked !== undefined)) {
    const candidate = onHue(l, chroma, base.h);
    if (!keepsFloors(candidate)) {
      continue;
    }
    if (!holdsMark(candidate)) {
      unmarked ??= candidate;
    } else if (candidate.c >= floorChroma - CHROMA_TOLERANCE) {
      return candidate;
    } else {
      nearest ??= candidate;
    }
  }
  const tint = nearest ?? unmarked;
  if (tint === undefined) {
    // Black and white sit at least the separation off any host family and clear AA against each other's side.
    throw new Error("unable to derive a tint that keeps its separation from every host");
  }
  return tint;
}

/**
 * An ink on the tone's hue at the tone's share of chroma, on the page ink's side: from the default mix's lightness, the
 * nearest toward the page ink's end point that clears every ground at the derivation ratio, capped at what that end point
 * reaches and never below the AA floor. The page ink clears the page family and every solved tint lets its end point clear
 * the floor, so the end point always ends the search; the gamut thins the chroma toward it.
 */
function solveInk<Host extends string>(palette: TonePalette<Host>, base: Oklch, percent: number, grounds: readonly Oklch[]): Oklch {
  const direction = palette.foreground.l < palette.background.l ? -1 : 1;
  const chroma = (base.c * percent) / PERCENT;
  const groundPixels = grounds.map((ground) => luminances(oklchToSrgb(ground)));
  const worst = (l: number): number => worstLuminanceContrast(luminances(oklchToSrgb(onHue(l, chroma, base.h))), groundPixels);
  const target = Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worst(direction > 0 ? 1 : 0)));
  const lightness = nearestClearingLightness(mixOklab(base, percent, palette.foreground).l, direction, (candidate) => worst(candidate) >= target);
  if (lightness === null) {
    throw new Error("unable to derive a tone ink that clears its grounds");
  }
  return onHue(lightness, chroma, base.h);
}

/** The nearest lightness from `start` toward `direction`'s end that `clears`, bisected on the step grid; `null` when the end itself does not. */
function nearestClearingLightness(start: number, direction: 1 | -1, clears: (l: number) => boolean): number | null {
  const end = direction > 0 ? 1 : 0;
  if (clears(start)) {
    return start;
  }
  if (!clears(end)) {
    return null;
  }
  const at = (step: number): number => Math.min(1, Math.max(0, Math.round((start + direction * step * ROLE_L_STEP) / ROLE_L_STEP) * ROLE_L_STEP));
  let low = 1;
  let high = Math.ceil(Math.abs(end - start) / ROLE_L_STEP);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (clears(at(middle))) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return clears(at(low)) ? at(low) : end;
}

/**
 * The literal colours a carried scope emits for one colored tone ({@link carriedLiteralRoles}), solved from the role
 * defaults: its tints first, then each ink over the grounds its floor names, the solved tints included. Each keeps the
 * tone's hue; the other roles stay the mixes the `[data-tone]` block spells. `scheme` is the page scheme: a tint is one
 * literal over every {@link TONE_HOSTS} surface, so it starts from the page and keeps its separation from each.
 */
export function solveCarriedToneRoles<Role extends string, Knob extends string>(
  scheme: ToneScheme<Role, Knob, CarriedToneHost>,
  tone: ToneColors,
  defaults: Readonly<Record<Knob, number>>,
): Readonly<Partial<Record<Role, Oklch>>> {
  const { recipes, palette } = scheme;
  const hosts = TONE_HOSTS.map((host) => palette.hosts[host]);
  const colors: Record<Role, Oklch> = { ...toneRoleColors(scheme, tone, defaults) };
  const literals: Partial<Record<Role, Oklch>> = {};
  const surfaces = literalSurfaces(recipes, defaults);
  const [weakest] = surfaces;
  for (const { role, step } of surfaces) {
    // The one literal sits on every host, so it carries each host's page inks.
    const floors = TONE_HOSTS.flatMap((host) => roleFloors(recipes[role], tone, tonePaletteOn(palette, host)));
    const inks = [...new Set(floors.map((over) => ("role" in over ? colors[over.role] : palette.hosts[over.host])))];
    const weakestPercent = weakest === undefined ? defaults[step.mix] : defaults[weakest.step.mix];
    const tint = solveTint(palette, tone.base, { percent: defaults[step.mix], weakestPercent, inks, hosts, mark: tone.base });
    colors[role] = tint;
    literals[role] = tint;
  }
  for (const { role, step } of literalInks(recipes)) {
    const grounds = recipes[role].floor.map((over) => ("role" in over ? colors[over.role] : palette.hosts[over.host]));
    const ink = solveInk(palette, tone.base, defaults[step.mix], grounds);
    colors[role] = ink;
    literals[role] = ink;
  }
  return literals;
}
