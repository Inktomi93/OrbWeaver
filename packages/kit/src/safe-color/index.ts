// The D44 §12.1 color-safety predicate — the ONE clamp every raw-color acceptor shares. Kit-homed
// (isomorphic, pure, zero-dep) because its consumers span the CAKE: the `@orb/ui` render clamps
// (`<ThemeScope>`, `sandbox-frame` token injection, `color-field`) AND the `@orb/contracts/theme`
// WIRE schema — ui and contracts cannot import each other (D44 §12.5: the two Zod clamps are a
// deliberate cake-forced pair, pairing-test-pinned), but both reach kit, so the PREDICATE itself
// never forks. Moved ui/lib → kit at the §12.8 contracts pass.

// A color must be one of these SAFE forms. Deliberately NO url()/expression()/var()/gradient — a value
// that could carry a network fetch or a CSS escape is rejected outright (not sanitized). Hex, rg[b]a(),
// hsl[a](), oklch()/oklab(), and the bare CSS named colors are the whole permitted surface.
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const RGB = /^rgba?\(\s*[0-9., %/]+\)$/iu;
const HSL = /^hsla?\(\s*[0-9., %/deg]+\)$/iu;
const OKL = /^okl(?:ch|ab)\(\s*[0-9.\-% /]+\)$/iu;
// A letters-only SHAPE check, NOT a CSS named-color allowlist: it admits any 3–20 letter word (so
// `isSafeColor("notacolorxx") === true`). That is intentional and safe — an unknown bare word is an
// INVALID CSS color the browser simply ignores (it can carry no url/fetch/escape: no separators, no
// parens, injection-guarded below). The point here is to reject payload SHAPES, not to enumerate the
// ~150 CSS names; a browser-invalid word degrades to "property unset", never to a vector.
const NAMED = /^[a-z]{3,20}$/iu; // transparent, currentColor, red, … AND any other bare letter-word.
// Belt: reject anything carrying a CSS-escape or fetch vector even if it slipped a shape test.
const INJECTION = /[;{}<>()\\]|url|expression|javascript:|@import|\/\*/iu;

// A legit color value (oklch(...), #rrggbbaa, rgba(...)) is well under this; longer = a payload attempt.
const MAX_COLOR_LEN = 64;

/**
 * The D44 §12.1 color-safety predicate: a color must parse as one of the safe CSS color forms
 * (hex / rgb[a]() / hsl[a]() / oklch()/oklab() / a bare letter-word — see `NAMED`: a shape check, not a
 * named-color allowlist; an unknown word is browser-invalid, harmless) and never carry an
 * injection vector (`url()`, `expression()`, `javascript:`, `@import`, a `{`/`;` escape). The ONE
 * clamp every raw-color acceptor shares (`ThemeScope`, `sandbox-frame`, `color-field`) — never
 * re-derive a color regex (UI-Primitives-and-Reuse.md §13.9).
 */
export function isSafeColor(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_COLOR_LEN) {
    return false;
  }
  // url()/expression() contain "(" so the INJECTION guard catches them; the shape guards below allow
  // the "(" ONLY inside the known color-function forms, which the guard would also flag — so check the
  // shape FIRST and only run the injection guard on the named/hex path (functional forms are exact).
  if (HEX.test(value) || NAMED.test(value)) {
    return !INJECTION.test(value);
  }
  return RGB.test(value) || HSL.test(value) || OKL.test(value);
}

// ── STATIC sRGB parsing for the derive law's judgments (#204) ────────────────────────────────────────
// `parseCssColorToSrgb` reads the NUMERIC CSS color forms (hex / rgb[a]() / hsl[a]()) into an sRGB
// triple + alpha, so the ThemeScope prose-ink clamp and the polarity derivation can JUDGE an authored
// value in any numeric format instead of failing open on spelling (owner authorization 2026-08-18: the
// engine guarantees legibility for arbitrary imported themes — ST themes are hex/hsl-heavy). Named
// colors return null on purpose: without a DOM there is no value to read, and the derive law's rule for
// a statically unreadable color is fail-open, never guess. oklch()/oklab() are NOT parsed here — the
// oklch reader lives with its consumers (theme-scope/clamp.ts, the richer L/C/H/A form).

const HEX_SHORT_LEN = 4;
const HEX_LONG_ALPHA_LEN = 9;
const HEX_MAX_NIBBLE = 15;
const HEX_RADIX = 16;
const HEX_PAIR = 2;
const HEX_ALPHA_OFFSET = 6;
const LIGHTNESS_DOUBLE = 2;
// The classic HSL piecewise ramp, stated in DEGREES: a channel rises over the first 60°, holds to
// 180°, falls to 240°, then floors — R/G/B read the same ramp at +120°/0°/−120°.
const HSL_RISE_END_DEG = 60;
const HSL_FLAT_END_DEG = 180;
const HSL_FALL_END_DEG = 240;
const HSL_RED_OFFSET_DEG = 120;
const HSL_BLUE_OFFSET_DEG = -120;
const CHANNEL_MAX = 255;
const PERCENT_MAX = 100;
const ALPHA_PERCENT_DIVISOR = 100;
const HSL_HALF = 0.5;
const RGB_FN_RE = /^rgba?\(\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*[,\s]\s*([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/iu;
const HSL_FN_RE = /^hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/iu;

/** An sRGB reading of a numeric CSS color: channels 0–255, alpha 0–1. */
export interface ParsedSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}

function alphaOf(raw: string | undefined): number {
  if (raw === undefined) {
    return 1;
  }
  const v = raw.endsWith("%") ? Number.parseFloat(raw) / ALPHA_PERCENT_DIVISOR : Number.parseFloat(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

function channelOf(raw: string): number {
  const v = raw.endsWith("%") ? (Number.parseFloat(raw) / PERCENT_MAX) * CHANNEL_MAX : Number.parseFloat(raw);
  return Math.max(0, Math.min(CHANNEL_MAX, v));
}

function parseHex(value: string): ParsedSrgbColor | null {
  const hex = value.slice(1);
  if (hex.length <= HEX_SHORT_LEN) {
    const nibbles = [...hex].map((ch) => Number.parseInt(ch, HEX_RADIX));
    if (nibbles.some((n) => Number.isNaN(n))) {
      return null;
    }
    const [r, g, b, a] = nibbles;
    const widen = (n: number | undefined): number => ((n ?? 0) * CHANNEL_MAX) / HEX_MAX_NIBBLE;
    return { r: widen(r), g: widen(g), b: widen(b), alpha: a === undefined ? 1 : a / HEX_MAX_NIBBLE };
  }
  const pair = (i: number): number => Number.parseInt(hex.slice(i, i + HEX_PAIR), HEX_RADIX);
  const r = pair(0);
  const g = pair(HEX_PAIR);
  const b = pair(HEX_PAIR * 2);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return null;
  }
  const alpha = value.length === HEX_LONG_ALPHA_LEN ? pair(HEX_ALPHA_OFFSET) / CHANNEL_MAX : 1;
  return { r, g, b, alpha: Number.isNaN(alpha) ? 1 : alpha };
}

function hslChannel(p: number, q: number, hueDegRaw: number): number {
  const h = ((hueDegRaw % HUE_WHEEL_DEGREES) + HUE_WHEEL_DEGREES) % HUE_WHEEL_DEGREES;
  if (h < HSL_RISE_END_DEG) {
    return p + (q - p) * (h / HSL_RISE_END_DEG);
  }
  if (h < HSL_FLAT_END_DEG) {
    return q;
  }
  if (h < HSL_FALL_END_DEG) {
    return p + (q - p) * ((HSL_FALL_END_DEG - h) / HSL_RISE_END_DEG);
  }
  return p;
}

function parseHsl(h: number, sPct: number, lPct: number, alpha: number): ParsedSrgbColor {
  const s = Math.max(0, Math.min(1, sPct / PERCENT_MAX));
  const l = Math.max(0, Math.min(1, lPct / PERCENT_MAX));
  if (s === 0) {
    const v = l * CHANNEL_MAX;
    return { r: v, g: v, b: v, alpha };
  }
  const q = l < HSL_HALF ? l * (1 + s) : l + s - l * s;
  const p = LIGHTNESS_DOUBLE * l - q;
  return {
    r: hslChannel(p, q, h + HSL_RED_OFFSET_DEG) * CHANNEL_MAX,
    g: hslChannel(p, q, h) * CHANNEL_MAX,
    b: hslChannel(p, q, h + HSL_BLUE_OFFSET_DEG) * CHANNEL_MAX,
    alpha,
  };
}

/**
 * Parse a NUMERIC CSS color (hex `#rgb[a]`/`#rrggbb[aa]`, `rgb[a]()` comma or space syntax, `hsl[a]()`)
 * into sRGB channels + alpha — `null` for anything else (named colors, oklch — see the section header).
 */
export function parseCssColorToSrgb(raw: string): ParsedSrgbColor | null {
  const value = raw.trim();
  if (HEX.test(value)) {
    return parseHex(value);
  }
  const rgb = RGB_FN_RE.exec(value);
  if (rgb !== null && rgb[1] !== undefined && rgb[2] !== undefined && rgb[3] !== undefined) {
    return { r: channelOf(rgb[1]), g: channelOf(rgb[2]), b: channelOf(rgb[3]), alpha: alphaOf(rgb[4]) };
  }
  const hsl = HSL_FN_RE.exec(value);
  if (hsl !== null && hsl[1] !== undefined && hsl[2] !== undefined && hsl[3] !== undefined) {
    return parseHsl(Number.parseFloat(hsl[1]), Number.parseFloat(hsl[2]), Number.parseFloat(hsl[3]), alphaOf(hsl[4]));
  }
  return null;
}

/** The three `oklch(L C H)` components, in order — the only form this reader parses. */
const OKLCH_COMPONENTS = /^oklch\(\s*([\d.%-]+)\s+([\d.%-]+)\s+([\d.-]+)/iu;
const HUE_WHEEL_DEGREES = 360;

/**
 * The HUE angle of an `oklch(L C H)` color, normalised to [0,360), or `null` for any other form.
 *
 * Deliberately narrow: it exists so a surface can tell whether two AUTHORED tints are perceptually the same
 * colour (side-eye 2026-08-03 — two speakers' dialogue spans shipped 8° apart and read as one), and hue is
 * the only axis that answers that at the fixed lightness/chroma this app tints at. `null` for hex/rgb/hsl is
 * an honest "cannot compare", never a conversion guess: a caller that cannot read a hue must leave the
 * authored value alone rather than de-collide against a fabricated number.
 */
export function oklchHue(raw: string): number | null {
  const match = OKLCH_COMPONENTS.exec(raw.trim());
  const hue = match === null ? Number.NaN : Number.parseFloat(match[3] ?? "");
  return Number.isFinite(hue) ? ((hue % HUE_WHEEL_DEGREES) + HUE_WHEEL_DEGREES) % HUE_WHEEL_DEGREES : null;
}

/** The shortest angular distance between two hue angles, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b) % HUE_WHEEL_DEGREES;
  return raw > HUE_WHEEL_DEGREES / 2 ? HUE_WHEEL_DEGREES - raw : raw;
}
