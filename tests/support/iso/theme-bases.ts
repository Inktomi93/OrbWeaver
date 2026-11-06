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

const CROSSOVER_L_START = 0.54;
const CROSSOVER_L_STEP = 0.0007;
const CROSSOVER_L_STEPS = 58;
const CROSSOVER_CHROMAS = [0, 0.06, 0.12, 0.25] as const;

/** Bases a person types with fractional digits: a ramp member lands a hair across the black/white crossover, between the accepted matrix's steps. */
export const TYPED_CROSSOVER_BASES: readonly Oklch[] = [
  { l: 0.5606, c: 0.12, h: 240 },
  { l: 0.5548, c: 0.25, h: 120 },
];

/** The fractional grid across the crossover, where the page and a ramp member can sit on either side of it. */
export const CROSSOVER_BASES: readonly Oklch[] = [
  ...TYPED_CROSSOVER_BASES,
  ...CROSSOVER_CHROMAS.flatMap((c) =>
    Array.from({ length: CROSSOVER_L_STEPS }, (_unused, index) => Number((CROSSOVER_L_START + index * CROSSOVER_L_STEP).toFixed(4))).flatMap((l) =>
      HUES.map((h) => ({ l, c, h })),
    ),
  ),
];
