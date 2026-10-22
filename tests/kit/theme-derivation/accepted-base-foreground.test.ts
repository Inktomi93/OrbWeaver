import type { Oklch, Rgb } from "@orb/kit/theme-derivation";
import {
  AA_NORMAL_RATIO,
  compositeSrgb,
  derivedForegroundLightness,
  derivedForegroundLightnessForSurfaces,
  derivedMutedForegroundPair,
  oklchToSrgb,
  rampDeltas,
  rampSurface,
  surfacePolarity,
  THEME_DERIVATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const LIGHTNESSES = [...Array.from({ length: 101 }, (_unused, index) => index / 100), 0.62, 0.6201];
const CHROMAS = [0, 0.01, 0.25, 1, 3.6];
const HUES = [0, 60, 180, 300];
const SHARED_ROLES = ["sidebar", "surfaceRaised", "card", "popover", "secondary", "muted"] as const;

// D202 fixes the pre-paint target independently of the implementation's private search constant.
const EXPECTED_DERIVATION_RATIO = 4.6;

function quantize({ r, g, b }: Rgb): Rgb {
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function attainableTarget(anchor: Oklch): number {
  const endpoint = oklchToSrgb({ l: surfacePolarity(anchor) === "light" ? 0 : 1, c: 0, h: anchor.h });
  const surface = oklchToSrgb(anchor);
  const capacity = Math.min(wcagContrastRatio(endpoint, surface), wcagContrastRatio(quantize(endpoint), quantize(surface)));
  return Math.max(AA_NORMAL_RATIO, Math.min(EXPECTED_DERIVATION_RATIO, capacity));
}

function assertContrast(ink: Rgb, surface: Rgb, target: number, label: string): void {
  expect(wcagContrastRatio(ink, surface), `${label}: float`).toBeGreaterThanOrEqual(target);
  expect(wcagContrastRatio(quantize(ink), quantize(surface)), `${label}: framebuffer`).toBeGreaterThanOrEqual(target);
}

function assertBase(base: Oklch): { readonly inputProjected: boolean; readonly rampProjected: boolean } {
  const { h } = base;
  const label = JSON.stringify(base);
  const target = attainableTarget(base);
  const deltas = rampDeltas(base);
  const raised = rampSurface(base, deltas.surfaceRaised);
  const card = rampSurface(base, deltas.card);
  const popover = rampSurface(base, deltas.popover);
  const shared = [base, raised, card];
  const sharedInk = oklchToSrgb({ l: derivedForegroundLightnessForSurfaces(shared), c: 0, h });
  for (const surface of shared) {
    assertContrast(sharedInk, oklchToSrgb(surface), target, `${label}: shared`);
  }
  for (const [role, delta] of Object.entries(deltas)) {
    const surface = rampSurface(base, delta);
    assertContrast(oklchToSrgb({ l: derivedForegroundLightness(surface), c: 0, h }), oklchToSrgb(surface), attainableTarget(surface), `${label}: ${role}`);
  }
  const opaqueHosts = [base, ...SHARED_ROLES.filter((role) => role !== "surfaceRaised").map((role) => rampSurface(base, deltas[role]))];
  const pair = derivedMutedForegroundPair(base, opaqueHosts, [base, card, popover]);
  const mutedInk = oklchToSrgb({ l: pair.lightness, c: 0, h });
  for (const host of opaqueHosts) {
    assertContrast(mutedInk, oklchToSrgb(host), target, `${label}: muted`);
  }
  const inputInk = oklchToSrgb({ l: derivedForegroundLightness(base), c: 0, h });
  for (const backing of [base, card, popover]) {
    assertContrast(mutedInk, compositeSrgb(inputInk, pair.inputAlpha, oklchToSrgb(backing)), target, `${label}: input`);
  }
  expect(pair.inputAlpha).toBeGreaterThanOrEqual(0);
  expect(pair.inputAlpha).toBeLessThanOrEqual(THEME_DERIVATION.inputAlpha);
  const arm = THEME_DERIVATION.ramp[surfacePolarity(base)];
  return {
    inputProjected: pair.inputAlpha < THEME_DERIVATION.inputAlpha,
    rampProjected: SHARED_ROLES.some((role) => deltas[role] !== arm[role]),
  };
}

test("accepted bases retain clearing semantic and muted/input solvers with nonzero projection populations", () => {
  const bases = CHROMAS.flatMap((c) => LIGHTNESSES.flatMap((l) => HUES.map((h) => ({ l, c, h }))));
  const results = bases.map(assertBase);
  expect(results).toHaveLength(2060);
  expect(results.filter(({ inputProjected }) => inputProjected).length).toBeGreaterThan(0);
  expect(results.filter(({ rampProjected }) => rampProjected).length).toBeGreaterThan(0);
});

test("clearing dark and light bases preserve their existing foreground endpoints", () => {
  expect(derivedForegroundLightness({ l: 0.15, c: 0.015, h: 250 })).toBe(THEME_DERIVATION.fgLMax);
  expect(derivedForegroundLightness({ l: 0.95, c: 0.01, h: 60 })).toBe(THEME_DERIVATION.fgLMin);
});
