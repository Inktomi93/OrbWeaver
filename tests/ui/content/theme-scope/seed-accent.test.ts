// An accent-only scope over a seed palette (D336, D355): its primary is judged on the seed's own hosts, so it clears
// every tone floor and its disabled controls dim by a step solved for it, on every seed.
import { AA_NON_TEXT_RATIO, compositeSrgb, oklchToSrgb, quantized, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { emittedLiterals, parsed, SEED_PAGES, scopeMisses, seedAccentScope } from "./tone-scope-misses.ts";

const BACKGROUND_VAR = TOKENS["color.background"].cssVar;
const OPACITY_VAR = TOKENS["opacity.disabled"].cssVar;

/** A pale pick, a mid one, a dark one no one ink covers with its steps, a very pale one, and one past the sRGB gamut. */
const ACCENTS = ["oklch(0.9 0.1 150)", "oklch(0.65 0.12 150)", "oklch(0.3 0.1 260)", "oklch(0.96 0.03 90)", "oklch(0.55 0.37 300)"] as const;

for (const { name, background } of SEED_PAGES) {
  test(`an accent-only scope over the ${name} palette clears every tone floor and tint separation on every host`, () => {
    const misses = ACCENTS.flatMap((accent) => scopeMisses(seedAccentScope(background, accent), `${name} ${accent}`, { pairs: false }));
    expect(misses).toEqual([]);
  });

  test(`an accent-only scope over the ${name} palette dims a disabled control until its primary text reads at 3:1`, () => {
    const page = oklchToSrgb(parsed(background));
    for (const accent of ACCENTS) {
      const { vars } = seedAccentScope(background, accent);
      const percent = Number.parseFloat(vars[OPACITY_VAR] ?? "");
      expect(percent, accent).toBeGreaterThanOrEqual(Number.parseFloat(TOKENS["opacity.disabled"].value));
      const ink = emittedLiterals(vars, "primary").text;
      expect(ink, accent).toBeDefined();
      const dimmed = compositeSrgb(oklchToSrgb(ink ?? parsed(accent)), percent / 100, page);
      expect(Math.min(wcagContrastRatio(dimmed, page), wcagContrastRatio(quantized(dimmed), quantized(page))), accent).toBeGreaterThanOrEqual(
        AA_NON_TEXT_RATIO,
      );
    }
  });
}

// Light's own step is 78%. The pale pick's judged primary needs no more, and a dark one needs a step above it.
// 86% is what the same pick needs unjudged: its raw fill under the default mix, which the clamp no longer paints.
test.each([
  ["oklch(0.65 0.12 150)", "78%"],
  ["oklch(0.3 0.1 260)", "79%"],
] as const)("an accent-only scope over Light with %s emits the solved inactive opacity %s", (accent, solved) => {
  const light = SEED_THEME_VALUE_SETS.light.vars[BACKGROUND_VAR];
  expect(clampThemeTokens({ accent }, light, undefined, { palette: "seed" }).vars[OPACITY_VAR]).toBe(solved);
});
