// The OKL color readers for the theme clamp — pure conversion only, extracted from clamp.ts at the
// component-size split (the clamp keeps the POLICY: what fails open, what gets judged). The standards
// parser and CSS gamut mapping live at the shared safe-color boundary; this module converts its sRGB
// result into the OKL coordinates the derivation consumes.
import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import { compositeSrgb, oklchToSrgb, srgbToOklch } from "@orb/kit/theme-derivation";
export interface ParsedOklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
  readonly inGamut?: boolean;
}

const CSS_COLOR_PRECISION = 8;

/** Bounded CSS spelling safe to carry back through the 64-byte color gate in a nested ThemeScope. */
export function serializeOpaqueOklch(color: Pick<ParsedOklch, "l" | "c" | "h">): string {
  const component = (value: number): string => Number(value.toFixed(CSS_COLOR_PRECISION)).toString();
  return `oklch(${component(color.l)} ${component(color.c)} ${component(color.h)})`;
}
/** Any standards-valid color admitted by the security gate → CSS-gamut-mapped OKLCH+alpha. Invalid safe
 * bare words and context-dependent `currentColor` remain null; callers use the actual ambient surface. */
export function toOklch(color: string): ParsedOklch | null {
  const css = parseCssColorToSrgb(color);
  if (css === null) {
    return null;
  }
  const o = srgbToOklch({ r: css.r, g: css.g, b: css.b });
  return { l: o.l, c: o.c, h: o.h, alpha: css.alpha, inGamut: css.inGamut };
}

/** Resolve `carried` over an opaque ambient surface. Invalid/contextual carried colors paint nothing and
 * therefore resolve to the ambient. Without an ambient, an opaque carried color remains usable; an
 * alpha-bearing one cannot be judged and returns null. */
export function compositedBase(carried: string, ambient: string | undefined): ParsedOklch | null {
  const top = toOklch(carried);
  const under = ambient === undefined ? null : toOklch(ambient);
  if (top === null) {
    return under === null ? null : { ...under, alpha: 1, inGamut: true };
  }
  if (top.alpha >= 1) {
    return { ...top, alpha: 1 };
  }
  if (under === null) {
    return null;
  }
  const composed = srgbToOklch(compositeSrgb(oklchToSrgb(top), top.alpha, oklchToSrgb(under)));
  return { ...composed, alpha: 1, inGamut: true };
}
