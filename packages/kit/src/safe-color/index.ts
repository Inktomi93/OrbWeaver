import Color from "colorjs.io";

// The D44 §12.1 color-safety predicate — the ONE clamp every raw-color acceptor shares. Kit-homed
// (isomorphic and pure) because its consumers span the CAKE: the `@orb/ui` render clamps
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

// ── STATIC sRGB parsing for the derive law's judgments (#204 / #939) ─────────────────────────────────
// The security predicate above remains the gate. AFTER that gate, ColorJS supplies the standards CSS
// Color parser + CSS gamut mapping the pure ThemeScope boundary needs for named colors, alpha and extreme
// accepted OKLCH values. Unknown safe bare words remain accepted by the security contract and return null:
// the browser ignores them as invalid CSS, while ThemeScope derives from its known ambient backing.
const CHANNEL_MAX = 255;

/** An sRGB reading of a numeric CSS color: channels 0–255, alpha 0–1. */
export interface ParsedSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
  /** Whether the authored color was already inside sRGB before CSS gamut mapping. */
  readonly inGamut: boolean;
}

type ColorParseOutcome = { readonly ok: true; readonly color: ParsedSrgbColor } | { readonly ok: false; readonly error: unknown };

function parseStandardsColor(value: string): ColorParseOutcome {
  try {
    const authored = new Color(value);
    const inGamut = authored.inGamut("srgb");
    const color = authored.to("srgb").toGamut({ method: "css" });
    const [r, g, b] = color.coords;
    const alpha = Number(color.alpha);
    if (![r, g, b, alpha].every(Number.isFinite)) {
      return { ok: false, error: new TypeError("ColorJS returned non-finite channels") };
    }
    return { ok: true, color: { r: r * CHANNEL_MAX, g: g * CHANNEL_MAX, b: b * CHANNEL_MAX, alpha, inGamut } };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Parse any standards-valid color admitted by {@link isSafeColor} into CSS-gamut-mapped sRGB channels
 * + alpha. Invalid safe bare words and context-dependent `currentColor` return null rather than guessing.
 */
export function parseCssColorToSrgb(raw: string): ParsedSrgbColor | null {
  const value = raw.trim();
  if (!isSafeColor(value)) {
    return null;
  }
  const parsed = parseStandardsColor(value);
  return parsed.ok ? parsed.color : null;
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
