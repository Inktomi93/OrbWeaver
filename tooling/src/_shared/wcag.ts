// The WCAG 2.x contrast kernel — the fleet-shared ruler (snap --contrast, design-audit, the ui
// palette suites): sRGB relative luminance, the contrast ratio, and the large-text carve-out. One
// engine, every instrument → identical verdicts.
// ── Contrast (WCAG) ──────────────────────────────────────────────────────────

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

// sRGB→linear gamma correction (WCAG 2.x relative-luminance formula).
const RGB_MAX_CHANNEL = 255;
const SRGB_GAMMA_THRESHOLD = 0.039_28;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_DIVISOR = 1.055;
const SRGB_GAMMA_EXPONENT = 2.4;

function linearizeChannel(channel: number): number {
  const c = channel / RGB_MAX_CHANNEL;
  return c <= SRGB_GAMMA_THRESHOLD ? c / SRGB_LINEAR_DIVISOR : ((c + SRGB_GAMMA_OFFSET) / SRGB_GAMMA_DIVISOR) ** SRGB_GAMMA_EXPONENT;
}

const LUMINANCE_R_WEIGHT = 0.2126;
const LUMINANCE_G_WEIGHT = 0.7152;
const LUMINANCE_B_WEIGHT = 0.0722;

export function relativeLuminance(c: Rgb): number {
  return LUMINANCE_R_WEIGHT * linearizeChannel(c.r) + LUMINANCE_G_WEIGHT * linearizeChannel(c.g) + LUMINANCE_B_WEIGHT * linearizeChannel(c.b);
}

const CONTRAST_OFFSET = 0.05;

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + CONTRAST_OFFSET) / (Math.min(la, lb) + CONTRAST_OFFSET);
}

/** Channel spread — the cheap chroma proxy the adapted impeccable color rules use. */
export function rgbChroma(c: Rgb): number {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

// CSS px per pt (96dpi/72pt) — WCAG's "18pt"/"14pt bold" large-text carve-out.
const CSS_PIXELS_PER_INCH = 96;
const POINTS_PER_INCH = 72;
const PT_TO_PX = CSS_PIXELS_PER_INCH / POINTS_PER_INCH;
const WCAG_LARGE_TEXT_PT = 18;
const WCAG_LARGE_BOLD_TEXT_PT = 14;
const LARGE_TEXT_PX = WCAG_LARGE_TEXT_PT * PT_TO_PX; // 24px
const LARGE_BOLD_TEXT_PX = WCAG_LARGE_BOLD_TEXT_PT * PT_TO_PX; // ~18.67px
const BOLD_WEIGHT = 700;

export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= LARGE_TEXT_PX || (fontSizePx >= LARGE_BOLD_TEXT_PX && fontWeight >= BOLD_WEIGHT);
}

export const NORMAL_MIN_RATIO = 4.5;
export const LARGE_MIN_RATIO = 3;
