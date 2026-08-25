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
//   • the neutral surface RAMP is the base with only L shifted (hue + chroma held) — by a delta from the
//     TWO-ARM `ramp` block, selected off the same pivot (#682): a dark base's chrome rises off it, a
//     light base's recedes, because above L ≈ 0.95 "lighter" has no headroom left and the whole family
//     collapses into one white;
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
// falls out is L ∈ [0.443, 0.686] (pinned in this module's test). That suite's "~0.28–0.62" is a deliberately
// generous exclusion range for a sweep — a prose approximation, not the boundary — so nothing here derives
// from it. The UPPER edge was 0.63 until #682 (2026-08-24) gave the surface ramp its polarity arm: above the
// pivot the chrome now recedes from the base instead of saturating toward white, so a base just over the
// pivot derives a sidebar-accent its own near-black text reads at 3.56:1. The widened slice is measurement,
// not regression — those palettes were never legible, they were clamped out of view.

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
 *  `ramp` is the neutral SURFACE ramp, and it is two-armed for the same reason and off the same pivot
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
  fgPivotL: 0.62,
  fgSteepness: 1000,
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
/** @public future: the large-text / non-text contrast gate (unbuilt) — WCAG AA for large text, the floor's
 *  sibling threshold beside `AA_NORMAL_RATIO`; the theme importer gates normal-size only today, this is the
 *  named constant that next gate reaches for. */
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
 *   • a number — the ink fails AA there: the LIGHTNESS to re-derive it at (the same steep pivot flip
 *     as every derived foreground), keeping the author's hue and chroma.
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
  return derivedForegroundLightness(base.l);
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
 * live 2026-08-18 (`reports/design/rescore-chats-2026-08-18.md`): at the flat 0.65 the light-palette
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
export function readingPlateAlpha(base: Oklch): number {
  const plateAlphaFloor = THEME_DERIVATION.readingPlate.alpha;
  if (base.l <= THEME_DERIVATION.fgPivotL) {
    return plateAlphaFloor;
  }
  const plate = oklchToSrgb(rampSurface(base, THEME_DERIVATION.readingPlate.deltaL));
  const baseLuminance = relativeLuminance(oklchToSrgb(base));
  // A light base ⇒ the reference ink is the DARK one `inkReferenceRatio` below it, and the worst art is
  // black. (The dark arm returned above; it would mirror both.)
  const referenceInk = greyWithLuminance((baseLuminance + CONTRAST_OFFSET) / THEME_DERIVATION.readingPlate.inkReferenceRatio - CONTRAST_OFFSET);
  const worstArt: Rgb = { r: 0, g: 0, b: 0 };
  for (let step = 0; step < PLATE_ALPHA_STEPS; step += 1) {
    const alpha = plateAlphaFloor + step * PLATE_ALPHA_STEP;
    if (wcagContrastRatio(referenceInk, compositeSrgb(plate, alpha, worstArt)) >= AA_NORMAL_RATIO) {
      // Re-round: 0.65 + n×0.001 accumulates binary-float dust that would reach the CSS literal.
      return Math.round(alpha / PLATE_ALPHA_STEP) * PLATE_ALPHA_STEP;
    }
  }
  return 1;
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
 * with is the base's derived foreground (`--color-foreground`), which
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
 * THE POLARITY PIVOT IS `fgPivotL`, the SAME one the foreground flip and `color-scheme` ride, so a
 * palette can never get light-arm elevation with dark-arm text. Strictly ABOVE the pivot is light,
 * matching `colorSchemeFor`'s boundary exactly.
 *
 * THE DARK ARM DOES NOT MOVE, by construction: its numbers ARE the base `@theme` recipe, and every one
 * carries chroma 0, so the emitted `oklch(from <base> l 0 h / a)` is the same white/black the token
 * literal spells whatever hue the base has. The LIGHT arm's small chroma tracks the PALETTE's hue rather
 * than Hearth's 60 — that is the one generalization over the hand-authored seed block, and it is
 * sub-quantization (max 0.25/255 per channel across the shipped light base, composited).
 */
export function shadowIngredients(base: Oklch): ShadowIngredients {
  const arm = base.l > THEME_DERIVATION.fgPivotL ? THEME_DERIVATION.shadow.light : THEME_DERIVATION.shadow.dark;
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
 * THE POLARITY PIVOT IS `fgPivotL`, the same one the foreground flip, `color-scheme` and the elevation
 * arm ride, so a palette can never get light-arm surfaces with dark-arm text. Strictly ABOVE the pivot is
 * light, matching `colorSchemeFor`'s boundary exactly.
 *
 * THE DARK ARM DOES NOT MOVE: for any base at or below the pivot this returns the pre-#682 numbers
 * unchanged, and a base whose polarity is not statically knowable keeps the dark arm too (the caller's
 * `base === null` fail-open — `@orb/ui` `derive-vars.ts`), so every dark room and every unjudgeable
 * palette emits the identical CSS byte-for-byte.
 *
 * THE MEASURED CONSEQUENCE, stated rather than hidden: because the light arm derives DOWN, a base just
 * above the pivot now produces sub-AA chrome, so {@link isDerivableBaseSurface}'s refused band widens at
 * the top (its test pins the new boundary). That is the predicate doing its job — those palettes really
 * cannot carry legible chrome — not a regression it papers over.
 */
export function rampDeltas(base: Oklch): RampDeltas {
  return base.l > THEME_DERIVATION.fgPivotL ? THEME_DERIVATION.ramp.light : THEME_DERIVATION.ramp.dark;
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
  const quantized = ({ r, g, b }: Rgb): Rgb => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
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
 * THE DIRECTION IS THE PIVOT'S, so this can never fight the foreground flip: above the pivot the card is
 * light and the accent must go DARKER; at or below it, lighter. The search walks `ACCENT_L_STEP` at a time
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
  const towardDark = base.l > THEME_DERIVATION.fgPivotL;
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

/**
 * Can orb DERIVE an acceptable palette from this base surface? False inside the pivot mid-band, where the
 * step flip produces a mid-tone foreground and the pair is inherently low-contrast (see the module header).
 * Measured, not asserted: it derives the foreground for the base AND for every ramp surface a plain derived
 * foreground is painted on, and requires each pairing to clear AA-NORMAL — the exact property the
 * `palette-contrast` suite enforces for orb's own palettes.
 */
export function isDerivableBaseSurface(base: Oklch): boolean {
  const foreground = oklchToSrgb(derivedForeground(base));
  const deltas = rampDeltas(base);
  const surfaces = [
    base,
    rampSurface(base, deltas.card),
    rampSurface(base, deltas.popover),
    rampSurface(base, deltas.sidebar),
    rampSurface(base, deltas.secondary),
    rampSurface(base, deltas.sidebarAccent),
  ];
  return surfaces.every((surface) => wcagContrastRatio(foreground, oklchToSrgb(surface)) >= AA_NORMAL_RATIO);
}
