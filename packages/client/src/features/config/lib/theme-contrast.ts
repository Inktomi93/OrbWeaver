// WCAG contrast (Tier-2 readability feedback) for the theme editor — split out of theme-editor-model so
// the model stays DOM-FREE (node-testable). Browser-resolved: the browser resolves any CSS colour (hex /
// named / hsl → `rgb()`, but oklch / oklab stay `oklch()` / `oklab()`) via getComputedStyle, the kit's
// colour parser reads that string, and the kit's WCAG ratio rates it. Runs only in the editor (a settings
// surface, not a hot path). Returns null when a colour can't be resolved (SSR/degenerate) — the caller
// shows no badge.

import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import type { Rgb } from "@orb/kit/theme-derivation";
import { wcagContrastRatio } from "@orb/kit/theme-derivation";

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
  return parseCssColorToSrgb(computed);
}

/** The WCAG contrast ratio (1–21) between two CSS colors, or null if either can't be resolved. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = resolveRgb(foreground);
  const bg = resolveRgb(background);
  return fg === null || bg === null ? null : wcagContrastRatio(fg, bg);
}
