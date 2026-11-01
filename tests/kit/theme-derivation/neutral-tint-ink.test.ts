// The neutral tone's strongest tint is bound so a page ink always clears AA on it: some neutral ink exists on every accepted base.
import type { Oklch } from "@orb/kit/theme-derivation";
import {
  AA_NORMAL_RATIO,
  carriedInks,
  compositeSrgb,
  oklchToSrgb,
  paintedDistance,
  rampDeltas,
  rampSurface,
  surfacePolarity,
  THEME_DERIVATION,
  TONE_TINT_SEPARATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

/** The best a neutral ink can do on a surface: the polarity's endpoint, black on a light page and white on a dark one. */
function bestInkRatio(base: Oklch, delta: number): number {
  const endpoint = oklchToSrgb({ l: surfacePolarity(base) === "light" ? 0 : 1, c: 0, h: base.h });
  return wcagContrastRatio(endpoint, oklchToSrgb(rampSurface(base, delta)));
}

test("every accepted base keeps a neutral ink that clears AA on the neutral tint-active, and the inks derive over it", () => {
  const misses = ACCEPTED_BASES.flatMap((base) => {
    const ratio = bestInkRatio(base, rampDeltas(base).accent);
    return ratio >= AA_NORMAL_RATIO ? [] : [`${JSON.stringify(base)} ${ratio.toFixed(2)}`];
  });
  expect(misses).toEqual([]);
  for (const base of ACCEPTED_BASES) {
    expect(() => carriedInks(base), JSON.stringify(base)).not.toThrow();
  }
});

// The light arm steps accent exactly the separation from muted, so 8-bit pixels can spend up to one step of it.
const PIXEL_SLACK = 0.004;
// A saturated base's lightness step thins at the gamut edge, so only a near-neutral ramp is held to the separation.
const NEAR_NEUTRAL_BASES = ACCEPTED_BASES.filter((base) => base.c <= 0.01);

test("every near-neutral base keeps the keyboard highlight apart from the rest tint and the popover it sits on", () => {
  const misses = NEAR_NEUTRAL_BASES.flatMap((base) => {
    const deltas = rampDeltas(base);
    const active = rampSurface(base, deltas.accent);
    const distance = Math.min(paintedDistance(active, rampSurface(base, deltas.muted)), paintedDistance(active, rampSurface(base, deltas.popover)));
    return distance >= TONE_TINT_SEPARATION - PIXEL_SLACK ? [] : [`${JSON.stringify(base)} ${distance.toFixed(4)}`];
  });
  expect(misses).toEqual([]);
});

test("every accepted base keeps the input fill at its full alpha, and the page ink clears a field on every panel", () => {
  const misses = ACCEPTED_BASES.flatMap((base) => {
    const inks = carriedInks(base);
    const deltas = rampDeltas(base);
    const wash = oklchToSrgb({ l: inks.muted.inputWash, c: 0, h: base.h });
    const ink = oklchToSrgb({ l: inks.foreground, c: 0, h: base.h });
    return [base, rampSurface(base, deltas.surfaceRaised), rampSurface(base, deltas.card), rampSurface(base, deltas.popover)].flatMap((panel) => {
      const ratio = wcagContrastRatio(ink, compositeSrgb(wash, THEME_DERIVATION.inputAlpha, oklchToSrgb(panel)));
      return ratio >= AA_NORMAL_RATIO ? [] : [`${JSON.stringify(base)} ${ratio.toFixed(2)}`];
    });
  });
  expect(misses).toEqual([]);
});

test("an arm that fits its base is returned as authored, and only a base near the crossover mirrors", () => {
  expect(rampDeltas({ l: 0.158, c: 0.006, h: 60 })).toBe(THEME_DERIVATION.ramp.dark);
  expect(rampDeltas({ l: 0.98, c: 0.004, h: 75 })).toBe(THEME_DERIVATION.ramp.light);
  expect(rampDeltas({ l: 0.93, c: 0.02, h: 90 })).toBe(THEME_DERIVATION.ramp.light);
  expect(rampDeltas({ l: 0.5, c: 0, h: 0 }).accent).toBe(-THEME_DERIVATION.ramp.dark.accent);
  expect(rampDeltas({ l: 0.6, c: 0, h: 0 }).accent).toBe(-THEME_DERIVATION.ramp.light.accent);
});

test("the unbound accent step leaves no passing ink on a mid-grey page, which the bound step repairs", () => {
  const base = { l: 0.55, c: 0, h: 0 };
  const polarity = surfacePolarity(base);
  const recipe = polarity === "light" ? THEME_DERIVATION.ramp.light.accent : THEME_DERIVATION.ramp.dark.accent;
  expect(bestInkRatio(base, recipe)).toBeLessThan(AA_NORMAL_RATIO);
  expect(bestInkRatio(base, rampDeltas(base).accent)).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
});
