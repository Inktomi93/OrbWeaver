// WCAG contrast (Tier-2 readability feedback) for the theme editor — split out of theme-editor-model so
// the model stays DOM-FREE (node-testable). Browser-resolved: any CSS color (oklch / relative / hex /
// named) → rgb via getComputedStyle, then the kit's WCAG ratio. Runs only in the editor (a settings
// surface, not a hot path). Returns null when a color can't be resolved (SSR/degenerate) — the caller
// shows no badge.

import type { Rgb } from "@orb/kit/theme-derivation";
import { wcagContrastRatio } from "@orb/kit/theme-derivation";

const RGB_RE = /rgba?\(([^)]+)\)/;

function resolveRgb(color: string): Rgb | null {
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
  return r === undefined || g === undefined || b === undefined ? null : { r, g, b };
}

/** The WCAG contrast ratio (1–21) between two CSS colors, or null if either can't be resolved. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = resolveRgb(foreground);
  const bg = resolveRgb(background);
  return fg === null || bg === null ? null : wcagContrastRatio(fg, bg);
}
