// D159 under a carried background: the ThemeScope clamp emits the form-control edge, solved over the scope's own panels.
// Each case reads the emitted variables back and judges the pixels they spell, never the solver's own return.
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, compositeSrgb, oklchToSrgb, RING_OVER_EDGE_MARGIN, rampDeltas, rampSurface, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES, HEARTH_ACCENT, MID_GREY } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { TOKEN_POLARITY_ARMS, TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { THEME_SCOPE_EMIT_VARS, THEME_SCOPE_STATIC_SEED_VARS } from "../../../../packages/ui/src/content/theme-scope/emit-vars.ts";
import { LIGHT_MID_TONE, STRONG_ACCENT } from "./contrast-cases.ts";
import { emittedGrey, parsed } from "./tone-scope-misses.ts";

const SWEEP_TIMEOUT_MS = 180_000;
const EDGE = TOKENS["color.input-border"].cssVar;

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** The fill a text field paints from `--color-field-fill`: the light arm of the token a light scope restates, else the emitted wash. */
function emittedFieldFill(
  spelling: string | undefined,
  hue: number,
  colorScheme: "light" | "dark" | undefined,
): { readonly color: Oklch; readonly alpha: number } {
  if (spelling !== TOKENS["color.field-fill"].value) {
    return emittedGrey(spelling, hue);
  }
  if (colorScheme !== "light") {
    throw new Error(`a ${colorScheme} scope restated the static field fill`);
  }
  return { color: parsed(TOKEN_POLARITY_ARMS["color.field-fill"].light), alpha: 1 };
}

function pixel(color: Oklch): Pixel {
  const { r, g, b } = oklchToSrgb(color);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

interface Judged {
  /** The lowest ratio between the edge and any panel, or any panel under a fill a control paints. */
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
  const fills = [
    emittedGrey(vars[TOKENS["color.input"].cssVar], base.h),
    emittedFieldFill(vars[TOKENS["color.field-fill"].cssVar], base.h, clamped.colorScheme),
  ];
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
  const seen = [
    ...panels,
    ...fills.flatMap((fill) =>
      panels.map((panel) => {
        const lit = compositeSrgb(oklchToSrgb(fill.color), fill.alpha, panel);
        return { r: Math.round(lit.r), g: Math.round(lit.g), b: Math.round(lit.b) };
      }),
    ),
  ];
  const card = pixel(rampSurface(base, deltas.card));
  const ringFill = vars[TOKENS["color.ring"].cssVar];
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
  expect(ringOnCard).toBeGreaterThanOrEqual(edgeOnCard + RING_OVER_EDGE_MARGIN);
  expect(ringOnCard).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  expect(reported).toBe(false);
  // The accent fill itself is not moved: only the ring is raised.
  expect(vars[TOKENS["color.ring"].cssVar]).not.toBe(vars[TOKENS["color.primary"].cssVar]);
});

test("a light mid-tone scope's edge holds 3:1 on the opaque text field it paints around, not only on the input wash", () => {
  const { worst, reported } = judged(LIGHT_MID_TONE, HEARTH_ACCENT);
  expect(worst).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
  expect(reported).toBe(false);
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

/** A dark accent, a saturated one past the gamut, and a pale one: rings that land below, near and above a carried edge. */
const NESTED_ACCENTS = ["oklch(0.3 0.1 260)", "oklch(0.55 0.37 300)", "oklch(0.9 0.12 95)"] as const;

interface NestedRing {
  readonly edgeOnCard: number;
  readonly ringOnCard: number;
  readonly raised: boolean;
  readonly reported: boolean;
}

/** An accent-only scope nested in a carried palette on `background`, as the cascade resolves it: the outer edge, and the ring the nested scope leaves in force. */
function nestedRing(background: string, accent: string): NestedRing {
  const base = parsed(background);
  const outer = clampThemeTokens({ background }, undefined, HEARTH_ACCENT);
  const nested = clampThemeTokens({ accent }, outer.resolvedBackground, outer.accentSource, { palette: "carried" });
  const vars = { ...outer.vars, ...nested.vars };
  const card = pixel(rampSurface(base, rampDeltas(base).card));
  return {
    edgeOnCard: wcagContrastRatio(pixel(emittedGrey(vars[EDGE], base.h).color), card),
    ringOnCard: wcagContrastRatio(pixel(parsed(vars[TOKENS["color.ring"].cssVar] ?? "")), card),
    raised: vars[TOKENS["color.ring"].cssVar] !== vars[TOKENS["color.primary"].cssVar],
    reported: nested.inputBorderFallback !== undefined,
  };
}

test(
  "an accent-only scope inside a carried palette holds its ring above the outer edge, or reports that no ring on its hue can",
  () => {
    const cases = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).flatMap((background) =>
      NESTED_ACCENTS.map((accent) => ({ label: `${background} nested ${accent}`, ...nestedRing(background, accent) })),
    );
    expect(cases.filter(({ edgeOnCard, ringOnCard, reported }) => !(reported || ringOnCard > edgeOnCard)).map(({ label }) => label)).toEqual([]);
    // The solve is doing the work: some nested rings are raised off the accent fill, which itself stays as painted.
    expect(cases.some(({ raised }) => raised)).toBe(true);
  },
  SWEEP_TIMEOUT_MS,
);

test("an accent-only scope over a seed palette leaves the ring to its fill", () => {
  const { vars, inputBorderFallback } = clampThemeTokens({ accent: NESTED_ACCENTS[0] }, MID_GREY, HEARTH_ACCENT);
  expect(vars[TOKENS["color.ring"].cssVar]).toBe(vars[TOKENS["color.primary"].cssVar]);
  expect(inputBorderFallback).toBeUndefined();
});

/** The highest ratio on the card any lightness of the scope's accent hue reaches, on a 0.01 grid. */
function bestRingOnCard(background: string): number {
  const base = parsed(background);
  const card = pixel(rampSurface(base, rampDeltas(base).card));
  const accent = parsed(clampThemeTokens({ background }, undefined, HEARTH_ACCENT).vars[TOKENS["color.primary"].cssVar] ?? "");
  const grid = Array.from({ length: 101 }, (_unused, index) => index / 100);
  return Math.max(...grid.map((l) => wcagContrastRatio(pixel({ l, c: accent.c, h: accent.h }), card)));
}

test(
  "a base reports only when no lightness of the accent's hue puts any ring above its edge on the card",
  () => {
    const unprovenReports = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).filter((background) => {
      const { edgeOnCard, reported } = judged(background, HEARTH_ACCENT);
      return reported && bestRingOnCard(background) > edgeOnCard;
    });
    expect(unprovenReports).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "a ring short of the margin is the best ring its hue offers",
  () => {
    const slack = 0.1;
    const wasted = ACCEPTED_BASES.map((base) => serializeOpaqueOklch(base)).filter((background) => {
      const { edgeOnCard, ringOnCard, reported } = judged(background, HEARTH_ACCENT);
      return !reported && (ringOnCard ?? 0) < edgeOnCard + RING_OVER_EDGE_MARGIN && bestRingOnCard(background) > (ringOnCard ?? 0) + slack;
    });
    expect(wasted).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);
