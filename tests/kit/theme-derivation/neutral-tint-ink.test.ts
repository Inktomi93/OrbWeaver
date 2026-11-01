// The neutral tone's strongest tint is bound so a page ink always clears AA on it: some neutral ink exists on every accepted base.
import type { Oklch } from "@orb/kit/theme-derivation";
import {
  AA_NORMAL_RATIO,
  accentFillLightness,
  carriedInks,
  carriedReadingHosts,
  compositeSrgb,
  oklchToSrgb,
  paintedDistance,
  proseInkCorrection,
  rampDeltas,
  rampSurface,
  srgbToOklch,
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

test("every accepted base keeps the page ink above AA on both neutral tints, so a hovered row needs no ink swap", () => {
  const misses = ACCEPTED_BASES.flatMap((base) => {
    const ink = oklchToSrgb({ l: carriedInks(base).foreground, c: 0, h: base.h });
    const { accent, muted } = rampDeltas(base);
    const ratio = Math.min(...[accent, muted].map((delta) => wcagContrastRatio(ink, oklchToSrgb(rampSurface(base, delta)))));
    return ratio >= AA_NORMAL_RATIO ? [] : [`${JSON.stringify(base)} ${ratio.toFixed(2)}`];
  });
  expect(misses).toEqual([]);
});

test("a picked prose ink re-derives until its chroma clears every reading host, and a pick that clears them stays", () => {
  const dialogue = { l: 0.86, c: 0.16, h: 85 };
  const misses = NEAR_NEUTRAL_BASES.flatMap((base) => {
    const hosts = carriedReadingHosts(base);
    const ink = oklchToSrgb({ ...dialogue, ...proseInkCorrection(dialogue, 1, base, hosts) });
    const ratio = Math.min(...hosts.map((host) => wcagContrastRatio(ink, oklchToSrgb(host))));
    return ratio >= AA_NORMAL_RATIO ? [] : [`${JSON.stringify(base)} ${ratio.toFixed(2)}`];
  });
  expect(misses).toEqual([]);
  const hearth = { l: 0.158, c: 0.006, h: 60 };
  expect(proseInkCorrection(dialogue, 1, hearth, carriedReadingHosts(hearth))).toBeNull();
});

test("a failing pick takes the least move from the author's lightness and keeps the author's chroma", () => {
  const hearth = { l: 0.158, c: 0.006, h: 60 };
  const speaker = { l: 0.6, c: 0.1, h: 30 };
  const hosts = carriedReadingHosts(hearth);
  const fix = proseInkCorrection(speaker, 1, hearth, hosts);
  expect(fix?.c).toBe(speaker.c);
  expect(fix?.l).toBeGreaterThan(speaker.l);
  expect(fix?.l).toBeLessThan(0.7);
  const worst = (lightness: number): number =>
    Math.min(...hosts.map((host) => wcagContrastRatio(oklchToSrgb({ ...speaker, l: lightness }), oklchToSrgb(host))));
  const l = fix?.l ?? 0;
  expect(worst(l)).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  expect(srgbToOklch(oklchToSrgb({ ...speaker, l })).c).toBeGreaterThan(0.09);
});

test("a pick is judged at the 8-bit pixel it paints, and a stepped chroma reaches the CSS without float dust", () => {
  const base = { l: 0.18, c: 0, h: 0 };
  const ink = { l: 0.6, c: 0.05, h: 240 };
  const hosts = carriedReadingHosts(base);
  expect(proseInkCorrection(ink, 1, base, hosts)?.l).toBeGreaterThan(ink.l);
  const steppedChroma = proseInkCorrection({ l: 0.86, c: 0.16, h: 85 }, 1, { l: 0.56, c: 0, h: 0 }, carriedReadingHosts({ l: 0.56, c: 0, h: 0 }));
  expect(String(steppedChroma?.c).length).toBeLessThanOrEqual(5);
});

test("a picked bubble fill replaces the derived one as a reading host, and hosts on both sides of the crossover leave a page-clearing pick alone", () => {
  const hearth = { l: 0.158, c: 0.006, h: 60 };
  const ink = { l: 0.7, c: 0, h: 0 };
  expect(proseInkCorrection(ink, 1, hearth, carriedReadingHosts(hearth))).toBeNull();
  const mid = { l: 0.5, c: 0, h: 0 };
  expect(proseInkCorrection(ink, 1, hearth, [...carriedReadingHosts(hearth), mid])?.l).toBeGreaterThan(ink.l);
  const white = { l: 1, c: 0, h: 0 };
  expect(proseInkCorrection(ink, 1, hearth, [...carriedReadingHosts(hearth), white])).toBeNull();
});

test("a corrected ink and accent stay inside sRGB at their lightness, so the hue they paint is the hue they named", () => {
  const page = { l: 0.6, c: 0, h: 0 };
  const dialogue = { l: 0.86, c: 0.16, h: 85 };
  const fix = proseInkCorrection(dialogue, 1, page, carriedReadingHosts(page));
  const painted = srgbToOklch(oklchToSrgb({ l: fix?.l ?? 0, c: fix?.c ?? 0, h: dialogue.h }));
  expect(Math.abs(painted.h - dialogue.h)).toBeLessThan(5);
  const hearth = { l: 0.72, c: 0.175, h: 52 };
  const corrected = accentFillLightness(hearth, 1, page);
  expect(corrected.kind === "corrected" ? Math.abs(corrected.fill.h - hearth.h) : 0).toBeLessThan(5);
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
