// The ONE CSS-colour reader for the ui-audit pure checks. Pure. Provenance: lib/collect.ts header.
//
// WHY THIS EXISTS (#983-family follow-up, 2026-09-01). `checks-decor.ts` and `checks-ornament.ts`
// each carried a hand-rolled `rgba?\(…\)`-and-hex regex, and `checks-decor` scraped channels with a
// bare `/[\d.]+/g`. Our tokens are OKLCH-only and raw colours are gate-RED at source
// (`no-raw-color-in-css`, the tokens-only biome hook), so those parsers could only ever fire on a
// value another gate already blocks. Measured with a two-direction control: the same zero-offset
// chromatic halo FIRED authored as `rgba(255,90,40,.55)` and was SILENT as
// `oklch(0.7 0.19 40 / 0.55)` — and silent again for `--shadow-glow`'s own relative form. Three
// shipped rules (`glow-shadow`, `radial-halo`, `radial-spotlight-glow`) were structurally dead.
//
// The remedy is the one our own law already required: `@orb/kit/safe-color` is the single colour
// clamp ("never re-derive a color regex" — UI-Primitives-and-Reuse.md §13.9), it is ColorJS-backed
// (standards CSS Color parsing + CSS gamut mapping), and `tooling/src/_shared/theme.ts` already
// reaches it. Colour-space blindness was never the right way to avoid false positives on the
// sanctioned effects — `checkRadialGlow` already takes a `sanctioned` flag, and a carrier allowlist
// is the exemption mechanism. Being blind to OKLCH also meant being blind to an UNSANCTIONED glow.
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import type { Rgb } from "@orb/tooling/_shared/wcag";

/** Colour FUNCTION heads we accept. `color-mix()` and OKLCH's relative form nest parentheses, so the
 *  span is closed by balanced-paren scanning, never by `[^)]*` (which stops at the inner `)` and
 *  hands the parser a truncated token). */
const COLOR_FN_HEAD = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/giu;

const HEX_TOKEN = /#[0-9a-f]{3,8}\b/giu;

/** Bare letter-words, the shape `@orb/kit`'s own NAMED check admits. Validity is decided by the kit
 *  parser, not by a table here: a word that is not a colour (`inset`, `solid`, `none`) simply fails
 *  to parse and the scan moves on, which is why no named-colour list is re-derived. */
const WORD_TOKEN = /[a-z]{3,20}/giu;

// `color-mix()` AND `hwb()` ARE REFUSED, AND THAT IS CORRECT HERE — do not "fix" it by widening the
// kit gate. `isSafeColor` is a SECURITY predicate (D44 §12.1) admitting only hex / rgb[a] / hsl[a] /
// oklch / oklab / bare-word, so both come back null. Harmless for these checks, because every caller
// reads COMPUTED style and Chromium resolves both before we ever see them — measured live
// 2026-09-01 on `:5173`, authored → computed:
//     color-mix(in oklab, oklch(0.7 0.19 40) 60%, transparent) → oklab(0.7 0.145548 0.12213 / 0.6)
//     hwb(200 20% 10%)                                         → rgb(51, 170, 230)
//     oklch(0.7 0.19 40 / 0.55)                                → oklch(0.7 0.19 40 / 0.55)   [KEPT]
// That last row is the whole reason this module exists: OKLCH survives into computed style, so a
// reader that cannot spell it is blind to every effect a tokens-only tree can author. If a future
// caller ever feeds AUTHORED css here, it owes its own resolution step — not a wider security gate.

/** Index of the `)` closing the paren opened at `openIdx`, or -1 when unbalanced. */
function closingParen(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i += 1) {
    if (text[i] === "(") {
      depth += 1;
    } else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

export interface ColorToken {
  readonly raw: string;
  readonly color: Rgb;
  readonly start: number;
  readonly end: number;
}

/** Parse any standards CSS colour to our `Rgb`, or null. A REFUSAL, never a guess: an unresolved
 *  `var()`, an authored relative form the browser has not resolved, and a non-colour word all return
 *  null so a caller declines rather than scoring against a fabricated channel. */
export function parseCssColor(raw: string): Rgb | null {
  const parsed = parseCssColorToSrgb(raw);
  return parsed === null ? null : { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.alpha };
}

/** Every parseable colour token in `text`, in source order, with its span. Function forms win over
 *  the word scan at the same offset, so `oklch(...)` is read whole rather than as the word `oklch`. */
function scanTokens(text: string): ColorToken[] {
  const found: ColorToken[] = [];
  const covered: Array<readonly [number, number]> = [];

  COLOR_FN_HEAD.lastIndex = 0;
  for (let m = COLOR_FN_HEAD.exec(text); m !== null; m = COLOR_FN_HEAD.exec(text)) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(text, open);
    if (close < 0) {
      continue;
    }
    const raw = text.slice(m.index, close + 1);
    const color = parseCssColor(raw);
    covered.push([m.index, close + 1]);
    if (color !== null) {
      found.push({ raw, color, start: m.index, end: close + 1 });
    }
    COLOR_FN_HEAD.lastIndex = close + 1;
  }

  const outside = (start: number): boolean => !covered.some(([a, b]) => start >= a && start < b);
  for (const re of [HEX_TOKEN, WORD_TOKEN]) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      if (!outside(m.index)) {
        continue;
      }
      const color = parseCssColor(m[0]);
      if (color !== null) {
        found.push({ raw: m[0], color, start: m.index, end: m.index + m[0].length });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The FIRST parseable colour token in `text`, or null. Used where a value carries exactly one
 *  colour (a shadow layer, a gradient stop argument). */
export function findColorToken(text: string): ColorToken | null {
  return scanTokens(text)[0] ?? null;
}
