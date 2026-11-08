// A base typed with fractional digits can put a ramp member a hair across the black/white crossover from the page (D202).
// Each case runs the production clamp and judges the emitted inks over the panels they paint.
import { AA_NORMAL_RATIO, rampDeltas, rampSurface, toneContrast } from "@orb/kit/theme-derivation";
import { CROSSOVER_BASES, TYPED_CROSSOVER_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { emittedInk, HEARTH_ACCENT, parsed } from "./tone-scope-misses.ts";

const SWEEP_TIMEOUT_MS = 180_000;
const PANEL_INKS = [
  ["card", "color.card-foreground"],
  ["popover", "color.popover-foreground"],
  ["secondary", "color.secondary-foreground"],
] as const;

/** What the page and each ramp panel paint under one typed background, and every way their inks part or miss. */
function crossoverMisses(background: string): readonly string[] {
  const base = parsed(background);
  const { vars } = clampThemeTokens({ background }, undefined, HEARTH_ACCENT);
  const deltas = rampDeltas(base);
  const page = emittedInk(vars[TOKENS["color.foreground"].cssVar], base.h);
  const pageIsDark = page.l < base.l;
  return PANEL_INKS.flatMap(([panel, token]) => {
    const ink = emittedInk(vars[TOKENS[token].cssVar], base.h);
    const surface = rampSurface(base, deltas[panel]);
    const ratio = toneContrast(ink, surface);
    return [
      ...(ink.l < base.l === pageIsDark ? [] : [`${background} ${panel} ink ${ink.l} sits across the page ink ${page.l}`]),
      ...(ratio >= AA_NORMAL_RATIO ? [] : [`${background} ${panel} ink ${ratio.toFixed(3)}`]),
    ];
  });
}

test("a typed base near the crossover solves, with a card a hair across it from the page", () => {
  const misses = TYPED_CROSSOVER_BASES.flatMap((base) => crossoverMisses(serializeOpaqueOklch(base)));
  expect(misses).toEqual([]);
});

test(
  "every fractional base across the crossover solves, and its panels keep the page's ink side at AA",
  () => {
    const misses = CROSSOVER_BASES.flatMap((base) => crossoverMisses(serializeOpaqueOklch(base)));
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);
