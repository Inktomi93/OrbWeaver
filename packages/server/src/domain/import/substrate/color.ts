// domain/import/substrate/color — the ST→orb COLOR conversion the theme plane needs, and nothing else.
// Pure: strings in, strings out, `null` on anything it cannot read.
//
// WHY IT EXISTS (two hard requirements the ST values fail without it):
//  1. POLARITY. `@orb/ui` `content/theme-scope/clamp.ts` derives `color-scheme` (and therefore which arm every
//     `light-dark()` intent token resolves to) by reading the OKLCH LIGHTNESS of the picked `background` —
//     `colorSchemeFor` returns null for ANY non-oklch form and fails open. ST writes every theme color as
//     `rgba(r, g, b, a)` (its picker reads `getComputedStyle`), so an ST palette imported verbatim would give
//     a LIGHT theme the dark intent arms. Converting at import is what makes an imported light theme legible.
//  2. ALPHA. ST theme colors are TINTS layered over a background photo: the chat panel tints the app surface,
//     the message tints sit on the chat panel. orb's `background` is an opaque BASE surface that a neutral
//     ramp derives from (`oklch(from background calc(l + Δ) c h)` — relative color syntax drops alpha, so a
//     translucent base would give a translucent `--color-background` and OPAQUE derived surfaces). So the
//     conversion FLATTENS: each tint is composited over the surface ST painted it on, and the result is an
//     opaque `oklch(L C H)`. That is what ST actually renders, not a guess.
//
// The sRGB→OKLab transform is Björn Ottosson's published matrix pair. Every coefficient is a named constant
// (`noMagicNumbers`), the same shape `client/features/settings/lib/theme-contrast.ts` uses for its WCAG luma
// weights. NOT kit-homed: one owner, one consumer (the ST theme parser beside it) — the placement rule puts a
// single-owner pure helper in its domain, and `@orb/kit/safe-color` is the SAFETY predicate's home, not a
// colorimetry library.

import type { Oklch } from "@orb/kit/theme-derivation";
import type { SrgbColor } from "../contract/views.ts";

const SRGB_MAX = 255;
const ALPHA_OPAQUE = 1;
// The sRGB transfer-function breakpoint (0.04045). Written WITH separators rather than suppressed: a new
// suppression would have to buy budget off the repo-wide ratchet, and the digits stay legible either way.
const SRGB_THRESHOLD = 0.040_45;
const SRGB_LINEAR_DIV = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;

// Ottosson's sRGB(linear)→LMS matrix (M1).
const LMS_L_R = 0.412_221_470_8;
const LMS_L_G = 0.536_332_536_3;
const LMS_L_B = 0.051_445_992_9;
const LMS_M_R = 0.211_903_498_2;
const LMS_M_G = 0.680_699_545_1;
const LMS_M_B = 0.107_396_956_6;
const LMS_S_R = 0.088_302_461_9;
const LMS_S_G = 0.281_718_837_6;
const LMS_S_B = 0.629_978_700_5;

// Ottosson's LMS'(cube-rooted)→OKLab matrix (M2).
const OKLAB_L_L = 0.210_454_255_3;
const OKLAB_L_M = 0.793_617_785;
const OKLAB_L_S = 0.004_072_046_8;
const OKLAB_A_L = 1.977_998_495_1;
const OKLAB_A_M = 2.428_592_205;
const OKLAB_A_S = 0.450_593_709_9;
const OKLAB_B_L = 0.025_904_037_1;
const OKLAB_B_M = 0.782_771_766_2;
const OKLAB_B_S = 0.808_675_766;

const DEGREES_PER_TURN = 360;
const HALF_TURN_DEGREES = 180;
const DEGREES_PER_RADIAN = HALF_TURN_DEGREES / Math.PI;
const L_PRECISION = 4;
const C_PRECISION = 4;
const H_PRECISION = 2;

const RGB_FUNC = /^rgba?\(([^)]*)\)$/i;
const RGB_SEPARATORS = /[,\s]+/;
const HEX_COLOR = /^#([0-9a-f]{3,8})$/i;
const HEX_SHORT_LEN = 3;
const HEX_SHORT_ALPHA_LEN = 4;
const HEX_LONG_LEN = 6;
const HEX_LONG_ALPHA_LEN = 8;
const HEX_PAIR = 2;
const HEX_RADIX = 16;
const PERCENT_MAX = 100;

/** One `rgb()`/`rgba()` argument: a bare number, or a percentage (the alpha slot accepts both forms). */
function component(raw: string, scale: number): number | null {
  const text = raw.trim();
  if (text.length === 0) {
    return null;
  }
  const isPercent = text.endsWith("%");
  const value = Number.parseFloat(isPercent ? text.slice(0, -1) : text);
  if (!Number.isFinite(value)) {
    return null;
  }
  return isPercent ? (value / PERCENT_MAX) * scale : value;
}

/** `rgb(r g b)` / `rgba(r, g, b, a)` in either separator style, or null. */
function parseRgbFunction(value: string): SrgbColor | null {
  const args = RGB_FUNC.exec(value)?.[1];
  if (args === undefined) {
    return null;
  }
  const parts = args
    .replaceAll("/", ",")
    .split(RGB_SEPARATORS)
    .filter((p) => p.length > 0);
  const [rawR, rawG, rawB, rawA] = parts;
  if (rawR === undefined || rawG === undefined || rawB === undefined) {
    return null;
  }
  const r = component(rawR, SRGB_MAX);
  const g = component(rawG, SRGB_MAX);
  const b = component(rawB, SRGB_MAX);
  const a = rawA === undefined ? ALPHA_OPAQUE : component(rawA, ALPHA_OPAQUE);
  if (r === null || g === null || b === null || a === null) {
    return null;
  }
  return { r, g, b, a };
}

/** `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, or null. Supported because a theme JSON is hand-editable —
 *  ST's own picker only ever writes `rgba()`, but a hand-written hex must not silently drop a real color. */
function parseHex(value: string): SrgbColor | null {
  const digits = HEX_COLOR.exec(value)?.[1];
  if (digits === undefined) {
    return null;
  }
  const short = digits.length === HEX_SHORT_LEN || digits.length === HEX_SHORT_ALPHA_LEN;
  if (!short && digits.length !== HEX_LONG_LEN && digits.length !== HEX_LONG_ALPHA_LEN) {
    return null;
  }
  const at = (index: number): number => {
    const slice = short ? digits.slice(index, index + 1).repeat(HEX_PAIR) : digits.slice(index * HEX_PAIR, index * HEX_PAIR + HEX_PAIR);
    return Number.parseInt(slice, HEX_RADIX);
  };
  const hasAlpha = digits.length === HEX_SHORT_ALPHA_LEN || digits.length === HEX_LONG_ALPHA_LEN;
  return { r: at(0), g: at(1), b: at(2), a: hasAlpha ? at(HEX_SHORT_LEN) / SRGB_MAX : ALPHA_OPAQUE };
}

/** Parse a CSS sRGB color literal (`rgb()`/`rgba()`/hex) to straight-alpha channels, or null when the form is
 *  one this converter cannot read (a named color, `oklch()`, a `var()` — all of which the caller reports). */
export function parseSrgb(raw: string): SrgbColor | null {
  const value = raw.trim();
  return parseRgbFunction(value) ?? parseHex(value);
}

/** Source-over composite of `fg` onto an OPAQUE `bg` — the flattening described in the module header. The
 *  result is always opaque, so compositing chains (tint on panel on surface) stay well-defined. */
export function compositeOver(fg: SrgbColor, bg: SrgbColor): SrgbColor {
  const a = Math.min(Math.max(fg.a, 0), ALPHA_OPAQUE);
  const mix = (f: number, b: number): number => a * f + (ALPHA_OPAQUE - a) * b;
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: ALPHA_OPAQUE };
}

/** Drop alpha without compositing — for the BASE surface, whose ST backdrop was an unknowable photo. */
export function opaque(color: SrgbColor): SrgbColor {
  return { r: color.r, g: color.g, b: color.b, a: ALPHA_OPAQUE };
}

function linearize(channel: number): number {
  const c = Math.min(Math.max(channel, 0), SRGB_MAX) / SRGB_MAX;
  return c <= SRGB_THRESHOLD ? c / SRGB_LINEAR_DIV : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

/** Convert an sRGB color to OKLCH (alpha ignored — every caller flattens first). The ROUNDED components, so
 *  the struct and the emitted literal describe the identical colour and the safety check measures exactly
 *  what will be persisted. */
export function toOklch(color: SrgbColor): Oklch {
  const r = linearize(color.r);
  const g = linearize(color.g);
  const b = linearize(color.b);
  const lRoot = Math.cbrt(LMS_L_R * r + LMS_L_G * g + LMS_L_B * b);
  const mRoot = Math.cbrt(LMS_M_R * r + LMS_M_G * g + LMS_M_B * b);
  const sRoot = Math.cbrt(LMS_S_R * r + LMS_S_G * g + LMS_S_B * b);
  const lightness = OKLAB_L_L * lRoot + OKLAB_L_M * mRoot - OKLAB_L_S * sRoot;
  const labA = OKLAB_A_L * lRoot - OKLAB_A_M * mRoot + OKLAB_A_S * sRoot;
  const labB = OKLAB_B_L * lRoot + OKLAB_B_M * mRoot - OKLAB_B_S * sRoot;
  const chroma = Number(Math.hypot(labA, labB).toFixed(C_PRECISION));
  // A color whose chroma rounds to zero is a NEUTRAL: its hue is arbitrary float noise (pure white lands on
  // ~89.88°), so pin it to 0 — otherwise two greys that render identically read as different hues to the
  // near-duplicate/hue-distance lenses.
  const hue = chroma === 0 ? 0 : (Math.atan2(labB, labA) * DEGREES_PER_RADIAN + DEGREES_PER_TURN) % DEGREES_PER_TURN;
  return { l: Number(lightness.toFixed(L_PRECISION)), c: chroma, h: Number(hue.toFixed(H_PRECISION)) };
}

/** Format an OKLCH colour as the `oklch(L C H)` literal orb's theme clamp reads. Fixed precision so the same
 *  ST file always yields byte-identical bytes (an idempotent re-import writes the same palette). */
export function oklchLiteral({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(L_PRECISION)} ${c.toFixed(C_PRECISION)} ${h.toFixed(H_PRECISION)})`;
}
