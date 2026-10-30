// The D336 numeric twin's kit half: the accent and muted tints share one ink on every accepted base, and the role mix
// space is OKLab. The recipe matrix itself runs through the clamp in tests/ui/content/theme-scope/tone-knobs.test.ts.
import { carriedTonePalette, familyForegroundLightness, mixOklab, rampDeltas, rampSurface, THEME_DERIVATION } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";

const LIGHTNESSES = [...Array.from({ length: 101 }, (_unused, index) => index / 100), 0.62, 0.6201];
const CHROMAS = [0, 0.01, 0.25, 1, 3.6];
const HUES = [0, 60, 180, 300];
const BASES = CHROMAS.flatMap((c) => LIGHTNESSES.flatMap((l) => HUES.map((h) => ({ l, c, h }))));
const TINT_PERCENT = 14;

test("one ink covers the accent and muted tints on every accepted base, by retracting the accent only where it must", () => {
  const retracted = BASES.filter((base) => {
    const deltas = rampDeltas(base);
    expect(familyForegroundLightness([rampSurface(base, deltas.accent), rampSurface(base, deltas.muted)]), JSON.stringify(base)).not.toBeNull();
    return deltas.accent !== THEME_DERIVATION.ramp.dark.accent && deltas.accent !== THEME_DERIVATION.ramp.light.accent;
  });
  expect(retracted.length).toBeGreaterThan(0);
  expect(retracted.length).toBeLessThan(BASES.length);
  expect(rampDeltas({ l: 0.158, c: 0.006, h: 60 })).toBe(THEME_DERIVATION.ramp.dark);
  expect(rampDeltas({ l: 0.98, c: 0.004, h: 75 })).toBe(THEME_DERIVATION.ramp.light);
});

test("a tone mix runs in OKLab, so a destructive tint over a warm page keeps the red hue", () => {
  const destructive = { l: 0.72, c: 0.19, h: 25 };
  const tint = mixOklab(destructive, TINT_PERCENT, carriedTonePalette({ l: 0.158, c: 0.006, h: 60 }).background);
  // OKLCH would carry the hue toward the page's 60; OKLab keeps the red within a few degrees.
  expect(Math.abs(tint.h - destructive.h)).toBeLessThan(10);
});
