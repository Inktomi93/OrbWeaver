// A carried scope's inactive-control opacity (D355): a user's theme raises the resting step until a disabled control's
// tone ink reads at 3:1 on the page it carries, on every accepted base. The tone text literal is the ink a fill-less
// disabled Button paints, and it is the one the scope emits as a colour a static reader can measure.
import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, compositeSrgb, oklchToSrgb, quantized, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES, LIGHT_TONE_THEME } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { TOKENS, TONES, toneLiteralVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";

const OPACITY = TOKENS["opacity.disabled"];
const RESTING_PERCENT = Number.parseFloat(OPACITY.value);

function percentOf(vars: Readonly<Record<string, string>>): number {
  const value = vars[OPACITY.cssVar];
  if (value === undefined) {
    throw new Error("the scope emitted no inactive opacity");
  }
  return Number.parseFloat(value);
}

/** The worse of the float and the 8-bit ratio an ink paints on its page with its control dimmed to `percent`. */
function dimmedRatio(ink: Oklch, page: Oklch, percent: number): number {
  const host = oklchToSrgb(page);
  const dimmed = compositeSrgb(oklchToSrgb(ink), percent / 100, host);
  return Math.min(wcagContrastRatio(dimmed, host), wcagContrastRatio(quantized(dimmed), quantized(host)));
}

/** Each colored tone's text literal a scope emits, parsed. */
function toneTexts(vars: Readonly<Record<string, string>>): readonly (readonly [string, Oklch])[] {
  return TONES.flatMap((tone) => {
    if (tone === "neutral") {
      return [];
    }
    const ink = toOklch(vars[toneLiteralVar(tone, "text")] ?? "");
    if (ink === null) {
      throw new Error(`the scope emitted no ${tone} text literal`);
    }
    return [[tone, ink] as const];
  });
}

test("a theme with light tone colours raises the inactive opacity until its disabled tone inks clear 3:1 on its page", () => {
  const { vars } = clampThemeTokens(LIGHT_TONE_THEME);
  const page = toOklch(LIGHT_TONE_THEME.background);
  if (page === null) {
    throw new Error("the case's page is not a colour");
  }
  const percent = percentOf(vars);
  expect(percent).toBeGreaterThan(RESTING_PERCENT);
  const texts = toneTexts(vars);
  expect(texts.length).toBe(TONES.length - 1);
  // The theme needed the raise: at the resting step some tone ink falls under the floor.
  expect(texts.filter(([, ink]) => dimmedRatio(ink, page, RESTING_PERCENT) < AA_NON_TEXT_RATIO).length).toBeGreaterThan(0);
  expect(texts.filter(([, ink]) => dimmedRatio(ink, page, percent) < AA_NON_TEXT_RATIO).map(([tone]) => tone)).toEqual([]);
});

test("every accepted carried base emits an inactive opacity at which each tone's disabled text clears 3:1 on its page", { tags: ["slow"] }, () => {
  const misses = ACCEPTED_BASES.flatMap((base) => {
    const { vars, resolvedBackground } = clampThemeTokens({ background: serializeOpaqueOklch(base) }, undefined, LIGHT_TONE_THEME.accent);
    const page = toOklch(resolvedBackground ?? "");
    if (page === null) {
      throw new Error(`base ${JSON.stringify(base)} resolved no page`);
    }
    const percent = percentOf(vars);
    return toneTexts(vars).flatMap(([tone, ink]) => (dimmedRatio(ink, page, percent) < AA_NON_TEXT_RATIO ? [`${JSON.stringify(base)} ${tone}`] : []));
  });
  expect(misses).toEqual([]);
});
