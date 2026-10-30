// D159 under a carried background: the ThemeScope clamp emits the form-control edge, solved over the scope's own panels.
// Each case reads the emitted variables back and judges the pixels they spell, never the solver's own return.
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, compositeSrgb, oklchToSrgb, rampDeltas, rampSurface, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { THEME_SCOPE_EMIT_VARS, THEME_SCOPE_STATIC_SEED_VARS } from "../../../../packages/ui/src/content/theme-scope/emit-vars.ts";
import { MID_GREY } from "./contrast-cases.ts";

const SWEEP_TIMEOUT_MS = 180_000;
const HEARTH_ACCENT = TOKENS["color.primary"].value;
const EDGE = "--color-input-border";
/** An accent that clears the card as authored, so the ring is not pulled down to the 3:1 floor the edge also holds. */
const STRONG_ACCENT = "oklch(0.2 0.1 260)";

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function parsed(color: string): Oklch {
  const value = toOklch(color);
  if (value === null) {
    throw new Error(`${color} does not parse`);
  }
  return value;
}

/** An emitted `oklch(from <origin> <l> 0 h / <alpha>)` as the achromatic pixel it paints and its alpha. */
function emittedGrey(spelling: string | undefined, hue: number): { readonly color: Oklch; readonly alpha: number } {
  const match = /^oklch\(from .+ ([\d.]+) 0 h \/ ([\d.]+)\)$/u.exec(spelling ?? "");
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`not an emitted grey: ${spelling}`);
  }
  return { color: { l: Number(match[1]), c: 0, h: hue }, alpha: Number(match[2]) };
}

function pixel(color: Oklch): Pixel {
  const { r, g, b } = oklchToSrgb(color);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

interface Judged {
  /** The lowest ratio between the edge and any panel, or any panel under the input fill. */
  readonly worst: number;
  readonly edgeOnCard: number;
  readonly ringOnCard: number | null;
  readonly reported: boolean;
}

/** The emitted edge against every ground it meets, read back from the emitted scope. */
function judged(background: string, accent: string | undefined): Judged {
  const base = parsed(background);
  const clamped = clampThemeTokens({ background, ...(accent === undefined ? {} : { accent }) }, undefined, accent);
  const { vars } = clamped;
  const edge = pixel(emittedGrey(vars[EDGE], base.h).color);
  const fill = emittedGrey(vars["--color-input"], base.h);
  const deltas = rampDeltas(base);
  const panels = [
    base,
    rampSurface(base, deltas.surfaceRaised),
    rampSurface(base, deltas.card),
    rampSurface(base, deltas.popover),
    rampSurface(base, deltas.sidebar),
    rampSurface(base, deltas.accent),
    rampSurface(base, deltas.sidebarAccent),
    rampSurface(base, deltas.secondary),
    rampSurface(base, deltas.muted),
  ].map((panel) => pixel(panel));
  const fillPixel = oklchToSrgb(fill.color);
  const seen = [
    ...panels,
    ...panels.map((panel) => {
      const lit = compositeSrgb(fillPixel, fill.alpha, panel);
      return { r: Math.round(lit.r), g: Math.round(lit.g), b: Math.round(lit.b) };
    }),
  ];
  const card = pixel(rampSurface(base, deltas.card));
  const ringFill = vars["--color-ring"];
  return {
    worst: Math.min(...seen.map((ground) => wcagContrastRatio(edge, ground))),
    edgeOnCard: wcagContrastRatio(edge, card),
    ringOnCard: ringFill === undefined ? null : wcagContrastRatio(pixel(parsed(ringFill)), card),
    reported: clamped.inputBorderFallback !== undefined,
  };
}

test("a carried scope emits the edge, its seed form stays the static polarity token, and an ink-only scope emits none", () => {
  expect(THEME_SCOPE_EMIT_VARS).toContain(EDGE);
  expect(THEME_SCOPE_STATIC_SEED_VARS).toContain(EDGE);
  expect(Object.keys(clampThemeTokens({ background: MID_GREY }).vars)).toContain(EDGE);
  expect(Object.keys(clampThemeTokens({ accent: "oklch(0.6 0.2 300)" }, MID_GREY).vars)).not.toContain(EDGE);
});

test("a mid-grey carried background with a strong accent gets an edge at 3:1 on every ground and under the focus ring on the card", () => {
  const { worst, edgeOnCard, ringOnCard, reported } = judged(MID_GREY, STRONG_ACCENT);
  expect(worst).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  expect(ringOnCard).not.toBeNull();
  expect(edgeOnCard).toBeLessThan(ringOnCard ?? 0);
  expect(reported).toBe(false);
});

test("a mid-grey scope whose inherited accent is corrected only to 3:1 raises the ring above the edge instead of reporting", () => {
  const { worst, edgeOnCard, ringOnCard, reported } = judged(MID_GREY, HEARTH_ACCENT);
  const { vars } = clampThemeTokens({ background: MID_GREY }, undefined, HEARTH_ACCENT);
  expect(worst).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  expect(ringOnCard).toBeGreaterThan(edgeOnCard);
  expect(ringOnCard).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  expect(reported).toBe(false);
  // The accent fill itself is not moved: only the ring is raised.
  expect(vars["--color-ring"]).not.toBe(vars["--color-primary"]);
});

test(
  "every accepted carried base clears the 3:1 floor on every ground",
  () => {
    const misses = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).flatMap((background) => {
      const { worst } = judged(background, HEARTH_ACCENT);
      return worst >= AA_NON_TEXT_RATIO ? [] : [`${background} ${worst.toFixed(3)}`];
    });
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "every accepted carried base holds focus above rest, or reports that no ring on the accent's hue can",
  () => {
    const bad = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).filter((background) => {
      const { edgeOnCard, ringOnCard, reported } = judged(background, HEARTH_ACCENT);
      return !(reported || (ringOnCard ?? 0) > edgeOnCard);
    });
    expect(bad).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "a base reports only when no lightness of the accent's hue puts a ring above its edge on the card",
  () => {
    const margin = 0.25;
    const unprovenReports = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).filter((background) => {
      const { edgeOnCard, reported } = judged(background, HEARTH_ACCENT);
      if (!reported) {
        return false;
      }
      const base = parsed(background);
      const card = pixel(rampSurface(base, rampDeltas(base).card));
      const accent = parsed(clampThemeTokens({ background }, undefined, HEARTH_ACCENT).vars["--color-primary"] ?? "");
      const grid = Array.from({ length: 101 }, (_unused, index) => index / 100);
      const best = Math.max(...grid.map((l) => wcagContrastRatio(pixel({ l, c: accent.c, h: accent.h }), card)));
      // A grid ring that clears the edge by the margin would contradict the report.
      return best >= edgeOnCard + margin;
    });
    expect(unprovenReports).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);
