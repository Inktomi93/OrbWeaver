// WCAG contrast (Tier-2 readability feedback) for the theme editor — split out of theme-editor-model so
// the model stays DOM-FREE (node-testable). Browser-resolved: any CSS color (oklch / relative / hex /
// named) → rgb via getComputedStyle, then the standard WCAG relative-luminance + contrast-ratio. Runs
// only in the editor (a settings surface, not a hot path). Returns null when a color can't be resolved
// (SSR/degenerate) — the caller shows no badge.

const SRGB_MAX = 255;
// biome-ignore lint/style/useNumericSeparators: the WCAG sRGB linearization threshold — a standard constant; separators would obscure it.
const SRGB_THRESHOLD = 0.03928;
const SRGB_LINEAR_DIV = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;
const CONTRAST_OFFSET = 0.05;
const RGB_RE = /rgba?\(([^)]+)\)/;

/** WCAG AA floor for body text. Below this, the editor shows a "hard to read" warning (non-blocking). */
export const AA_CONTRAST_FLOOR = 4.5;

function resolveRgb(color: string): readonly [number, number, number] | null {
  if (typeof document === "undefined") {
    return null;
  }
  const el = document.createElement("span");
  el.style.color = color;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  el.remove();
  const match = RGB_RE.exec(computed);
  if (match?.[1] === undefined) {
    return null;
  }
  const parts = match[1].split(",").map((s) => Number.parseFloat(s));
  const [r, g, b] = parts;
  return r === undefined || g === undefined || b === undefined ? null : [r, g, b];
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (channel: number): number => {
    const c = channel / SRGB_MAX;
    return c <= SRGB_THRESHOLD
      ? c / SRGB_LINEAR_DIV
      : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  };
  return LUMA_R * lin(r) + LUMA_G * lin(g) + LUMA_B * lin(b);
}

/** The WCAG contrast ratio (1–21) between two CSS colors, or null if either can't be resolved. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = resolveRgb(foreground);
  const bg = resolveRgb(background);
  if (fg === null || bg === null) {
    return null;
  }
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}
