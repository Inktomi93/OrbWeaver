// The OKL color readers for the theme clamp — pure parsing only, extracted from clamp.ts at the
// component-size split (the clamp keeps the POLICY: what fails open, what gets judged). The OKL literal
// forms are read HERE rather than in kit's sRGB parser because these readers live with their consumer;
// kit owns only the math (lab→lch, sRGB→OKLCH).
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import { oklabToOklch, srgbToOklch } from "@orb/kit/theme-derivation";

// Strict parse of an `oklch(L C H[ / A])` literal — the form the theme editor emits. L (and A) may be a
// 0–1 number OR a percentage. Anything else (a named color, rgb()/hsl(), a var()) returns null: the
// polarity is not STATICALLY knowable, so the caller must fail open, never guess.
const OKLCH_RE = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
const PERCENT_DIVISOR = 100;
export interface ParsedOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}
function unitOrPercent(raw: string): number {
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / PERCENT_DIVISOR : Number(raw);
}
function parseOklch(color: string): ParsedOklch | null {
  const m = OKLCH_RE.exec(color.trim());
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  const l = unitOrPercent(m[1]);
  const c = Number(m[2]);
  const h = Number(m[3]);
  const alpha = m[4] === undefined ? 1 : unitOrPercent(m[4]);
  return Number.isFinite(l) && Number.isFinite(c) && Number.isFinite(h) && Number.isFinite(alpha) ? { l, c, h, alpha } : null;
}
/** Any statically-readable color → OKLCH+alpha: the OKL literal forms (`oklch()`/`oklab()`, read here
 *  because kit owns only the lab→lch math), else a NUMERIC CSS form (hex/rgb()/hsl(), via kit's parser +
 *  the sRGB→OKLCH inverse — #204: an imported theme's hex/hsl ink is JUDGED, not failed-open on spelling).
 *  What stays null is a value with no readable static form — a named color, `currentColor` — plus the
 *  legal-but-unread spelling MEASURED to survive `isSafeColor` and reach here: modern unitless
 *  `hsl(30 40 20)` (kit's hsl reader requires the `%`). Those fail OPEN (pass-through, the pre-#204
 *  behaviour) — the safe direction, never a guessed polarity. Note the OTHER exotic spellings never get
 *  this far: `isSafeColor` drops a `deg`/negative hue inside `okl*()` and a negative hue in `hsl()`
 *  outright (probed 2026-08-18) — "named colors are the only fail-open" was wrong in both directions. */
export function toOklch(color: string): ParsedOklch | null {
  const literal = parseOklch(color) ?? parseOklab(color);
  if (literal !== null) {
    return literal;
  }
  const css = parseCssColorToSrgb(color);
  if (css === null) {
    return null;
  }
  const o = srgbToOklch({ r: css.r, g: css.g, b: css.b });
  return { l: o.l, c: o.c, h: o.h, alpha: css.alpha };
}
// `oklab(L a b[ / A])` — the OTHER `isSafeColor`-legal OKL form. L (and A) may be a 0–1 number or a
// percentage; a/b are signed. Read here rather than in kit's sRGB parser for the same reason the oklch
// literal is: the OKL readers live with their consumer, and kit owns only the lab→lch math.
const OKLAB_RE = /^oklab\(\s*([\d.]+%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;
function parseOklab(color: string): ParsedOklch | null {
  const m = OKLAB_RE.exec(color.trim());
  if (m === null || m[1] === undefined || m[2] === undefined || m[3] === undefined) {
    return null;
  }
  const { l, c, h } = oklabToOklch(unitOrPercent(m[1]), Number(m[2]), Number(m[3]));
  const alpha = m[4] === undefined ? 1 : unitOrPercent(m[4]);
  return Number.isFinite(l) && Number.isFinite(c) && Number.isFinite(h) && Number.isFinite(alpha) ? { l, c, h, alpha } : null;
}
export function parseOklchL(color: string): number | null {
  const parsed = toOklch(color);
  return parsed === null ? null : parsed.l;
}
