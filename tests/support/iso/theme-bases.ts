// The accepted-base matrix the theme-derivation suites sweep: every lightness step plus the historical pivot pair,
// from neutral to gamut-breaking chroma, in four hue quadrants. One home, so every suite judges the same bases.
import type { Oklch } from "@orb/kit/theme-derivation";

const LIGHTNESS_STEPS = 100;
const PIVOT_LIGHTNESSES = [0.62, 0.6201] as const;
const CHROMAS = [0, 0.01, 0.25, 1, 3.6] as const;
const HUES = [0, 60, 180, 300] as const;

// The swept lightnesses: 0 to 1 in hundredths, then the historical pivot pair.
const LIGHTNESSES: readonly number[] = [...Array.from({ length: LIGHTNESS_STEPS + 1 }, (_unused, index) => index / LIGHTNESS_STEPS), ...PIVOT_LIGHTNESSES];

/** Every base the accepted-base contract covers: each chroma by each lightness by each hue. */
export const ACCEPTED_BASES: readonly Oklch[] = CHROMAS.flatMap((c) => LIGHTNESSES.flatMap((l) => HUES.map((h) => ({ l, c, h }))));
