// D336: what the ThemeScope clamp emits for a carried background clears every tone's floors, primary included, for
// picked and inherited accents. Each case reads the emitted variables back and judges the pixels they spell.
import type { Oklch } from "@orb/kit/theme-derivation";
import { toneFloorMisses } from "@orb/kit/theme-derivation";
import { ACCEPTED_BASES } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { Tone, ToneMixKnob } from "@orb/ui/tokens";
import { TOKENS, TONE_MIX_DEFAULTS, TONE_MIX_KNOBS, toneKnobVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { serializeOpaqueOklch, toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import type { CarriedTone } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { carriedToneScheme, carriedToneSources } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { BASES } from "./contrast-cases.ts";

// The sweeps run the production clamp per case; they outrun the default per-test budget.
const SWEEP_TIMEOUT_MS = 180_000;
const HEARTH_ACCENT = TOKENS["color.primary"].value;
const ACCENT_LIGHTNESSES = Array.from({ length: 20 }, (_unused, index) => (index + 0.5) / 20);
const ACCENT_CHROMAS = [0, 0.06, 0.12, 0.2, 0.37];
const ACCENT_HUES = Array.from({ length: 8 }, (_unused, index) => index * 45);
const ACCENTS = ACCENT_LIGHTNESSES.flatMap((l) => ACCENT_CHROMAS.flatMap((c) => ACCENT_HUES.map((h) => `oklch(${l} ${c} ${h})`)));

function parsed(color: string): Oklch {
  const value = toOklch(color);
  if (value === null) {
    throw new Error(`${color} does not parse`);
  }
  return value;
}

/** The ink the clamp emits as `oklch(from <fill> <l> 0 h / 1)`: an achromatic pixel at that lightness. */
function emittedInk(spelling: string | undefined): Oklch {
  const lightness = /^oklch\(from .+ ([\d.]+) 0 h \/ 1\)$/u.exec(spelling ?? "")?.[1];
  if (lightness === undefined) {
    throw new Error(`not an emitted ink: ${spelling}`);
  }
  return { l: Number(lightness), c: 0, h: 0 };
}

/** The mix one tone reads from a scope's emitted variables: its own step knob when set, else the scope's knob. */
function emittedMix(vars: Readonly<Record<string, string>>, tone: Tone): Readonly<Record<ToneMixKnob, number>> {
  const knob = (name: ToneMixKnob): number => {
    const own = vars[toneKnobVar(tone, name)];
    const scope = vars[TOKENS[`tone-mix.${name}`].cssVar];
    const emitted = own ?? scope;
    return emitted === undefined ? TONE_MIX_DEFAULTS[name] : Number.parseFloat(emitted);
  };
  return Object.fromEntries(TONE_MIX_KNOBS.map((name) => [name, knob(name)])) as Record<ToneMixKnob, number>;
}

/** Every D336 floor the emitted scope misses: its intents and neutral from the carried palette, its primary and knobs as emitted. */
function emittedMisses(background: string, tokens: { readonly accent?: string }, ambientAccent?: string): readonly string[] {
  const { vars } = clampThemeTokens({ background, ...tokens }, undefined, ambientAccent);
  const scheme = carriedToneScheme(parsed(background));
  const fill = vars["--color-primary"];
  const primary: CarriedTone[] =
    fill === undefined ? [] : [{ tone: "primary", source: { base: parsed(fill), foreground: emittedInk(vars["--color-primary-foreground"]) } }];
  return [...carriedToneSources(scheme, null), ...primary].flatMap(({ tone, source }) =>
    toneFloorMisses(scheme, source, emittedMix(vars, tone)).map(
      (miss) => `${background} ${JSON.stringify(tokens)} ${ambientAccent ?? ""} ${tone} ${JSON.stringify(miss)}`,
    ),
  );
}

test("a fallback raises only the tone that needs it: primary's steps rise while destructive keeps the default", () => {
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", accent: "oklch(0.3 0.1 260)" });
  const primary = emittedMix(vars, "primary");
  const destructive = emittedMix(vars, "destructive");
  expect(primary.hover).toBeGreaterThan(TONE_MIX_DEFAULTS.hover);
  expect(primary.active).toBeGreaterThan(TONE_MIX_DEFAULTS.active);
  expect(destructive.hover).toBe(TONE_MIX_DEFAULTS.hover);
  expect(destructive.active).toBe(TONE_MIX_DEFAULTS.active);
});

test("a picked accent whose fill and solid steps share no ink still clears its hover and active floors", () => {
  expect(emittedMisses("oklch(0.5 0 0)", { accent: "oklch(0.53 0.2 30)" })).toEqual([]);
});

test("an out-of-gamut accent is judged as the pixel it paints", () => {
  const authored = "oklch(0.78 0.4 140)";
  const { vars } = clampThemeTokens({ background: "oklch(0.158 0.006 60)", accent: authored });
  expect(vars["--color-primary"]).not.toBe(authored);
  expect(toOklch(vars["--color-primary"] ?? "")?.inGamut).toBe(true);
  expect(emittedMisses("oklch(0.158 0.006 60)", { accent: authored })).toEqual([]);
});

test(
  "every tone clears every D336 floor over the accepted-base matrix with the inherited accent",
  () => {
    expect(ACCEPTED_BASES.flatMap((base) => emittedMisses(serializeOpaqueOklch(base), {}, HEARTH_ACCENT))).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "every picked and inherited accent clears every tone's floors on each contrast-case base",
  () => {
    const misses = BASES.flatMap(({ background }) =>
      ACCENTS.flatMap((accent) => [...emittedMisses(background, { accent }), ...emittedMisses(background, {}, accent)]),
    );
    expect(misses).toEqual([]);
  },
  SWEEP_TIMEOUT_MS,
);

test(
  "the knob defaults miss on part of the matrix, so the solve is doing the work",
  () => {
    const missing = ACCEPTED_BASES.filter((base) => {
      const scheme = carriedToneScheme(base);
      return carriedToneSources(scheme, parsed(HEARTH_ACCENT)).some(({ source }) => toneFloorMisses(scheme, source, TONE_MIX_DEFAULTS).length > 0);
    });
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(ACCEPTED_BASES.length);
  },
  SWEEP_TIMEOUT_MS,
);
