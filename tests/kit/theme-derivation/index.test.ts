// Mirror test for kit/theme-derivation — the D71 derivation numbers + the node-side prediction of them.
//
// The point of this module is that TWO packages that cannot see each other must agree about one derivation:
// `@orb/ui`'s clamp emits the CSS a browser evaluates, and `@orb/server`'s ST theme importer predicts the
// result to decide whether a foreign palette converts safely. So the tests pin (1) that the ui clamp really
// reads these numbers rather than carrying its own copy — the whole reason they moved down the cake — and
// (2) that the safety predicate DISCRIMINATES, with a positive and a negative control on each side of the
// documented pivot mid-band.

import {
  AA_NORMAL_RATIO,
  derivedForeground,
  derivedForegroundLightness,
  isDerivableBaseSurface,
  oklchToSrgb,
  rampSurface,
  THEME_DERIVATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { describe } from "vitest";
import { THEME_DERIVATION as UI_THEME_DERIVATION } from "../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../support/fixtures.ts";

describe("THEME_DERIVATION", () => {
  test("is the SAME object the ui clamp exposes — one home, no drift", () => {
    // If clamp.ts ever re-declares its own numbers, this identity check fails before the divergence can
    // reach a rendered pixel or a wrong import decision.
    expect(UI_THEME_DERIVATION).toBe(THEME_DERIVATION);
  });
});

describe("derivedForegroundLightness", () => {
  test("flips light↔dark around the pivot, clamped to the readable band", () => {
    const { fgPivotL, fgLMin, fgLMax } = THEME_DERIVATION;
    // A dark surface gets near-white text…
    expect(derivedForegroundLightness(0.15)).toBe(fgLMax);
    // …a light surface gets near-black…
    expect(derivedForegroundLightness(0.95)).toBe(fgLMin);
    // …and the pivot itself resolves to the dark arm's ceiling (the `(pivot - l)` sign, matching clamp.ts).
    expect(derivedForegroundLightness(fgPivotL)).toBe(fgLMin);
  });
});

describe("wcagContrastRatio", () => {
  test("matches the WCAG extremes", () => {
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    expect(wcagContrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(wcagContrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});

describe("oklchToSrgb", () => {
  test("round-trips the published primaries back to sRGB", () => {
    // The inverse of the importer's sRGB→OKLCH; a transposed coefficient shows up as a wrong channel here.
    const red = oklchToSrgb({ l: 0.628, c: 0.2577, h: 29.23 });
    expect(red.r).toBeCloseTo(255, 0);
    expect(red.g).toBeCloseTo(0, 0);
    expect(red.b).toBeCloseTo(0, 0);
  });
});

describe("isDerivableBaseSurface", () => {
  test("accepts the realistic dark + light bases orb's own palettes use", () => {
    // The same representative bases the ui palette-contrast suite sweeps (Mocha/Hearth-dark and Light).
    for (const l of [0.1, 0.15, 0.158, 0.2, 0.25]) {
      expect(isDerivableBaseSurface({ l, c: 0.015, h: 250 }), `dark base L=${l}`).toBe(true);
    }
    for (const l of [0.9, 0.95, 0.98]) {
      expect(isDerivableBaseSurface({ l, c: 0.01, h: 60 }), `light base L=${l}`).toBe(true);
    }
  });

  test("REFUSES the pivot mid-band — the documented limitation, which a foreign palette CAN hit", () => {
    // PLANTED POSITIVE CONTROL. No hand-authored orb palette lands here, so without this the predicate would
    // be a fence nobody has ever seen bite. A mid-grey page surface is inherently low-contrast for any
    // sub-maximal derived tone; the SillyTavern importer refuses such a theme rather than importing it.
    // The band is MEASURED (see the boundary test below), not assumed from the prose approximation.
    for (const l of [0.45, 0.5, 0.55, 0.6, 0.62, 0.63]) {
      expect(isDerivableBaseSurface({ l, c: 0.01, h: 250 }), `mid-band base L=${l}`).toBe(false);
    }
  });

  test("the refused band's EDGES are where the measurement puts them (0.45 … 0.63)", () => {
    // NEGATIVE CONTROLS either side. This is the number the ST importer's refusal reason describes, and it
    // is narrower than `palette-contrast.suite.test.ts`'s prose approximation ("~0.28–0.62") — that comment
    // is a rough exclusion range for a sweep, not a measured boundary, so it is not the authority here.
    expect(isDerivableBaseSurface({ l: 0.44, c: 0.01, h: 250 }), "just below the band").toBe(true);
    expect(isDerivableBaseSurface({ l: 0.64, c: 0.01, h: 250 }), "just above the band").toBe(true);
  });

  test("its verdict AGREES with a direct contrast measurement of the worst ramp pairing", () => {
    // Not a tautology: it re-derives the same judgement from the primitive parts, so a bug in the surface
    // LIST inside the predicate (a missing ramp member) would show up as a disagreement here.
    const base = { l: 0.5, c: 0.01, h: 250 };
    const worst = rampSurface(base, THEME_DERIVATION.ramp.popover);
    const ratio = wcagContrastRatio(oklchToSrgb(derivedForeground(base)), oklchToSrgb(worst));
    expect(ratio).toBeLessThan(AA_NORMAL_RATIO);
    expect(isDerivableBaseSurface(base)).toBe(false);
  });
});
