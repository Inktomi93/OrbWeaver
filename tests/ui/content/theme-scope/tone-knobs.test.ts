// D336: every tone's role pairs clear their floors over the accepted-base matrix once the clamp solves the knobs.
import type { Oklch } from "@orb/kit/theme-derivation";
import { toneFloorMisses } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";
import { TOKENS, TONE_MIX_DEFAULTS, TONES } from "@orb/ui/tokens";
import { toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { carriedToneScheme, carriedToneSources, correctedAccentFill, solveCarriedToneMix } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";

const LIGHTNESSES = [...Array.from({ length: 101 }, (_unused, index) => index / 100), 0.62, 0.6201];
const CHROMAS = [0, 0.01, 0.25, 1, 3.6];
const HUES = [0, 60, 180, 300];
// The matrix solve walks every base through the production clamp; it outruns the default per-test budget.
const MATRIX_TIMEOUT_MS = 60_000;
const BASES = CHROMAS.flatMap((c) => LIGHTNESSES.flatMap((l) => HUES.map((h) => ({ l, c, h }))));

const inheritedAccent = toOklch(TOKENS["color.primary"].value);
if (inheritedAccent === null) {
  throw new Error("the base primary token does not parse");
}

/** A carried base with no picked accent paints the inherited one, through the production correction. */
function carriedTones(base: Oklch): ReturnType<typeof carriedToneSources> {
  const scheme = carriedToneScheme(base);
  return carriedToneSources(scheme, correctedAccentFill(scheme, inheritedAccent) ?? inheritedAccent);
}

test(
  "every tone clears every D336 floor over the accepted-base matrix at the clamp-solved knobs",
  () => {
    const unsolved: string[] = [];
    for (const base of BASES) {
      const scheme = carriedToneScheme(base);
      const sources = carriedTones(base);
      expect(sources).toHaveLength(TONES.length);
      const mix = solveCarriedToneMix(scheme, sources);
      for (const source of sources) {
        const misses = toneFloorMisses(scheme, source, mix);
        if (misses.length > 0) {
          unsolved.push(`${JSON.stringify(base)} ${JSON.stringify(misses)}`);
        }
      }
    }
    expect(unsolved).toEqual([]);
  },
  MATRIX_TIMEOUT_MS,
);

test(
  "the knob defaults miss on part of the matrix, so the solve is doing the work",
  () => {
    const missing = BASES.filter((base) => {
      const scheme = carriedToneScheme(base);
      return carriedTones(base).some((source) => toneFloorMisses(scheme, source, TONE_MIX_DEFAULTS).length > 0);
    });
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(BASES.length);
  },
  MATRIX_TIMEOUT_MS,
);

test("a dark seed-like base keeps every default knob", () => {
  const base = { l: 0.158, c: 0.006, h: 60 };
  expect(solveCarriedToneMix(carriedToneScheme(base), carriedTones(base))).toEqual(TONE_MIX_DEFAULTS);
});
