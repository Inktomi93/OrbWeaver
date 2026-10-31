// The D336 numeric twin's kit half: the accent and muted tints share one ink on every accepted base, the role mix
// space is OKLab, and the tint separation holds between non-adjacent hues at the least tint chroma. The recipe matrix
// itself runs through the clamp in tests/ui/content/theme-scope/tone-knobs.test.ts.
import {
  carriedInks,
  carriedTonePalette,
  familyForegroundLightness,
  mixOklab,
  paintedDistance,
  rampDeltas,
  rampSurface,
  THEME_DERIVATION,
  TONE_HUE_ADJACENT_DEGREES,
  TONE_TINT_MIN_CHROMA,
  TONE_TINT_SEPARATION,
} from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const TINT_PERCENT = 14;
/** Hearth's page. */
const PAGE = { l: 0.158, c: 0.006, h: 60 };

test("one ink covers the accent and muted tints on every accepted base, by retracting the accent only where it must", () => {
  const retracted = ACCEPTED_BASES.filter((base) => {
    const deltas = rampDeltas(base);
    expect(familyForegroundLightness([rampSurface(base, deltas.accent), rampSurface(base, deltas.muted)]), JSON.stringify(base)).not.toBeNull();
    return deltas.accent !== THEME_DERIVATION.ramp.dark.accent && deltas.accent !== THEME_DERIVATION.ramp.light.accent;
  });
  expect(retracted.length).toBeGreaterThan(0);
  expect(retracted.length).toBeLessThan(ACCEPTED_BASES.length);
  expect(rampDeltas({ l: 0.158, c: 0.006, h: 60 })).toBe(THEME_DERIVATION.ramp.dark);
  expect(rampDeltas({ l: 0.98, c: 0.004, h: 75 })).toBe(THEME_DERIVATION.ramp.light);
});

test("two tints at the least chroma, the adjacency bound apart in hue, keep the separation in the painted pixels", () => {
  const halfBound = TONE_HUE_ADJACENT_DEGREES / 2;
  const misses = [0.3, 0.45, 0.6, 0.75, 0.9].flatMap((l) =>
    Array.from({ length: 36 }, (_unused, index) => index * 10).flatMap((h) => {
      const a = { l, c: TONE_TINT_MIN_CHROMA, h: h - halfBound };
      const b = { l, c: TONE_TINT_MIN_CHROMA, h: h + halfBound };
      const distance = paintedDistance(a, b);
      return distance >= TONE_TINT_SEPARATION ? [] : [`L ${l} around hue ${h}: ${distance.toFixed(4)}`];
    }),
  );
  expect(misses).toEqual([]);
});

test("a tone mix runs in OKLab, so a destructive tint over a warm page keeps the red hue", () => {
  const destructive = { l: 0.72, c: 0.19, h: 25 };
  const tint = mixOklab(destructive, TINT_PERCENT, carriedTonePalette(PAGE, carriedInks(PAGE)).background);
  // OKLCH would carry the hue toward the page's 60; OKLab keeps the red within a few degrees.
  expect(Math.abs(tint.h - destructive.h)).toBeLessThan(10);
});
