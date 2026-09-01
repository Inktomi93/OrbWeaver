// Property fence for #969's total accepted-base contract. The narrow exact pivot tests prove the reported
// defect; this matrix prevents that repair from becoming a two-fixture exception.

import {
  AA_NORMAL_DERIVATION_RATIO,
  AA_NORMAL_RATIO,
  compositeSrgb,
  derivedForeground,
  derivedForegroundLightnessForSurfaces,
  derivedMutedForegroundPair,
  inputCompositeSurface,
  oklchToSrgb,
  rampDeltas,
  rampSurface,
  surfacePolarity,
  THEME_DERIVATION,
  wcagContrastRatio,
} from "@orb/kit/theme-derivation";
import { expect, test } from "../../support/fixtures.ts";

interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const LIGHTNESSES = [...Array.from({ length: 101 }, (_unused, index) => index / 100), 0.62, 0.6201] as const;
const CHROMAS = [0, 0.01, 0.25, 1, 3.6] as const;
const HUES = [0, 60, 180, 300] as const;
const BASES = LIGHTNESSES.flatMap((l) => CHROMAS.flatMap((c) => HUES.map((h): Oklch => ({ l, c, h }))));
const SHARED_RAMP_ROLES = ["sidebar", "surfaceRaised", "card", "popover", "secondary", "muted"] as const;

function worstContrast(ink: Oklch, surface: Oklch): number {
  const inkRgb = oklchToSrgb(ink);
  const surfaceRgb = oklchToSrgb(surface);
  return worstRgbContrast(inkRgb, surfaceRgb);
}

function worstRgbContrast(inkRgb: ReturnType<typeof oklchToSrgb>, surfaceRgb: ReturnType<typeof oklchToSrgb>): number {
  const quantize = ({ r, g, b }: typeof inkRgb): typeof inkRgb => ({ r: Math.round(r), g: Math.round(g), b: Math.round(b) });
  return Math.min(wcagContrastRatio(inkRgb, surfaceRgb), wcagContrastRatio(quantize(inkRgb), quantize(surfaceRgb)));
}

function expectClearing(ink: Oklch, surfaces: readonly Oklch[]): void {
  const endpoint = { l: ink.l < 0.5 ? 0 : 1, c: 0, h: ink.h };
  const attainableTarget = Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstContrast(endpoint, surfaces[0] ?? endpoint)));
  for (const surface of surfaces) {
    expect(worstContrast(ink, surface)).toBeGreaterThanOrEqual(attainableTarget);
  }
}

interface SampleResult {
  readonly rampProjected: boolean;
  readonly inputProjected: boolean;
  readonly legacyMutedFailed: boolean;
}

function assertBase(base: Oklch): SampleResult {
  const polarity = surfacePolarity(base);
  const arm = polarity === "light" ? THEME_DERIVATION.ramp.light : THEME_DERIVATION.ramp.dark;
  const deltas = rampDeltas(base);
  const surfaces = {
    raised: rampSurface(base, deltas.surfaceRaised),
    card: rampSurface(base, deltas.card),
    popover: rampSurface(base, deltas.popover),
    sidebar: rampSurface(base, deltas.sidebar),
    accent: rampSurface(base, deltas.accent),
    sidebarAccent: rampSurface(base, deltas.sidebarAccent),
    secondary: rampSurface(base, deltas.secondary),
    muted: rampSurface(base, deltas.muted),
  };
  const foreground = { l: derivedForegroundLightnessForSurfaces([base, surfaces.raised, surfaces.card]), c: 0, h: base.h };
  expectClearing(foreground, [base, surfaces.raised, surfaces.card]);
  for (const surface of [surfaces.card, surfaces.popover, surfaces.sidebar, surfaces.accent, surfaces.sidebarAccent, surfaces.secondary]) {
    expectClearing(derivedForeground(surface), [surface]);
  }

  const opaqueMutedHosts = [base, surfaces.card, surfaces.popover, surfaces.sidebar, surfaces.secondary, surfaces.muted];
  const mutedPair = derivedMutedForegroundPair(base, opaqueMutedHosts, [base, surfaces.card, surfaces.popover]);
  const mutedInk = { l: mutedPair.lightness, c: 0, h: base.h };
  expectClearing(mutedInk, opaqueMutedHosts);
  const inputInk = oklchToSrgb(derivedForeground(base));
  const mutedInkRgb = oklchToSrgb(mutedInk);
  const endpoint = { l: mutedInk.l < 0.5 ? 0 : 1, c: 0, h: mutedInk.h };
  const attainableTarget = Math.max(AA_NORMAL_RATIO, Math.min(AA_NORMAL_DERIVATION_RATIO, worstContrast(endpoint, base)));
  for (const backing of [base, surfaces.card, surfaces.popover]) {
    const inputHost = compositeSrgb(inputInk, mutedPair.inputAlpha, oklchToSrgb(backing));
    expect(worstRgbContrast(mutedInkRgb, inputHost)).toBeGreaterThanOrEqual(attainableTarget);
  }

  const oldMutedInk = { l: polarity === "light" ? THEME_DERIVATION.mutedLMin : THEME_DERIVATION.mutedLMax, c: 0, h: base.h };
  return {
    rampProjected: SHARED_RAMP_ROLES.some((role) => deltas[role] !== arm[role]),
    inputProjected: mutedPair.inputAlpha < THEME_DERIVATION.inputAlpha,
    legacyMutedFailed: [...opaqueMutedHosts, inputCompositeSurface(base, base)].some((surface) => worstContrast(oldMutedInk, surface) < AA_NORMAL_RATIO),
  };
}

test("#969 every accepted-base sample has a framebuffer-safe shared ink; unsafe ramp/input projections have nonzero populations", () => {
  expect(AA_NORMAL_DERIVATION_RATIO).toBe(4.6);
  const results = BASES.map(assertBase);
  expect(results).toHaveLength(2060);
  expect(results.filter(({ rampProjected }) => rampProjected).length).toBeGreaterThan(0);
  expect(results.filter(({ inputProjected }) => inputProjected).length).toBeGreaterThan(0);
  expect(results.filter(({ legacyMutedFailed }) => legacyMutedFailed).length).toBeGreaterThan(0);
});
