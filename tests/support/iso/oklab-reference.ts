// Published OKLab known answers: the oracle for the kit's sRGB <-> OKLCH maths. Every value below is
// copied from a spec or reference page, never computed by the kit, so a kit test that measures through
// `oklchToSrgb` still has an independent check on that ruler.
import type { Oklch, Rgb } from "@orb/kit/theme-derivation";

/** A colour's sRGB triple (channels 0-255) beside the OKLCH the source publishes for it. Each OKLCH
 *  tolerance is the last published digit's half unit, widened where the source's matrices differ from the kit's.
 *  Hue is powerless at chroma 0, so the white vector's hue is not graded. */
export interface OklabVector {
  readonly name: string;
  readonly source: string;
  readonly srgb: Rgb;
  readonly oklch: Oklch;
  readonly tolerance: Oklch;
}

// A published OKLCH rounded to three decimals moves a decoded 8-bit channel by well under one step.
export const SRGB_CHANNEL_TOLERANCE = 1;

// CSS Color 4 publishes yellow to 3 decimals and hue to 1.
const CSS4_ROUNDED = { l: 0.0005, c: 0.0005, h: 0.05 } as const;

const CSS_COLOR_4 = "https://www.w3.org/TR/css-color-4/ (section on HSL versus OkLCh)";
const CSS_COLOR_5 = "https://www.w3.org/TR/css-color-5/ (color-mix examples)";
const MDN_OKLCH = "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch (relative colour example, hsl(0 100% 50%))";

/** In-gamut sRGB colours with published OKLCH values: the primaries, secondaries and mid-chroma tones. */
export const OKLAB_VECTORS: readonly OklabVector[] = [
  { name: "white", source: CSS_COLOR_5, srgb: { r: 255, g: 255, b: 255 }, oklch: { l: 1, c: 0, h: 0 }, tolerance: { l: 0.0005, c: 0.0005, h: 0 } },
  {
    name: "red",
    source: MDN_OKLCH,
    srgb: { r: 255, g: 0, b: 0 },
    oklch: { l: 0.627_966, c: 0.257_704, h: 29.2346 },
    tolerance: { l: 0.0005, c: 0.0005, h: 0.05 },
  },
  {
    name: "blue",
    source: CSS_COLOR_5,
    srgb: { r: 0, g: 0, b: 255 },
    oklch: { l: 0.452_01, c: 0.313_21, h: 264.052 },
    tolerance: { l: 0.0005, c: 0.0005, h: 0.05 },
  },
  { name: "yellow", source: CSS_COLOR_4, srgb: { r: 255, g: 255, b: 0 }, oklch: { l: 0.968, c: 0.211, h: 109.8 }, tolerance: CSS4_ROUNDED },
  {
    name: "teal",
    source: CSS_COLOR_5,
    srgb: { r: 0, g: 128, b: 128 },
    oklch: { l: 0.5431, c: 0.0927, h: 194.8 },
    tolerance: { l: 0.0005, c: 0.0005, h: 0.05 },
  },
  {
    name: "olive",
    source: CSS_COLOR_5,
    srgb: { r: 128, g: 128, b: 0 },
    oklch: { l: 0.5807, c: 0.1266, h: 109.8 },
    tolerance: { l: 0.0005, c: 0.0005, h: 0.05 },
  },
];

/** An out-of-gamut OKLCH with the unclamped sRGB the source publishes; the negative red channel is the gamut edge. */
export const OKLAB_OUT_OF_GAMUT_VECTOR = {
  source: "https://www.w3.org/TR/css-color-5/ (relative colour example: oklch(0.69012 0.25077 199.893) is color(srgb -0.6018 0.7621 0.8448))",
  oklch: { l: 0.690_12, c: 0.250_77, h: 199.893 },
  srgbUnit: { r: -0.6018, g: 0.7621, b: 0.8448 },
} as const;
