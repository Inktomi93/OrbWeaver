// The ThemeScope clamp emits the D336 tone knobs a carried palette needs, and only names on its emit surface.
import type { Oklch } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";
import { TOKENS, TONE_MIX_DEFAULTS, TONE_MIX_KNOBS } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { THEME_SCOPE_EMIT_VARS } from "../../../../packages/ui/src/content/theme-scope/emit-vars.ts";
import { carriedToneScheme, carriedToneSources, solveCarriedToneMix } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";

const DARK_BASE = "oklch(0.158 0.006 60)";
const MID_BASE = "oklch(0.5 0.01 60)";
const LIGHT_BASE = "oklch(0.98 0.004 75)";
const KNOB_VARS = new Map(TONE_MIX_KNOBS.map((knob) => [TOKENS[`tone-mix.${knob}`].cssVar, knob] as const));
const HEARTH_ACCENT = TOKENS["color.primary"].value;

function parsed(color: string): Oklch {
  const value = toOklch(color);
  if (value === null) {
    throw new Error(`${color} does not parse`);
  }
  return value;
}

function emittedKnobs(vars: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(vars).flatMap(([name, value]) => (KNOB_VARS.has(name) ? [[KNOB_VARS.get(name), Number.parseFloat(value)]] : [])));
}

test("every emitted custom property is on the ThemeScope emit surface", () => {
  for (const background of [DARK_BASE, MID_BASE, LIGHT_BASE]) {
    const { vars } = clampThemeTokens({ background, accent: "oklch(0.6 0.2 300)", userBubble: { bg: "oklch(0.4 0.1 200)" } }, undefined, HEARTH_ACCENT);
    expect(Object.keys(vars).filter((name) => !(THEME_SCOPE_EMIT_VARS as readonly string[]).includes(name))).toEqual([]);
  }
});

test("a scope with no carried background emits no tone knob, so the cascade keeps the outer solve", () => {
  expect(emittedKnobs(clampThemeTokens({ accent: "oklch(0.6 0.2 300)" }, DARK_BASE, HEARTH_ACCENT).vars)).toEqual({});
});

test("a dark carried base emits every solved knob at its default", () => {
  const knobs = emittedKnobs(clampThemeTokens({ background: DARK_BASE }, undefined, HEARTH_ACCENT).vars);
  expect(Object.keys(knobs).length).toBeGreaterThan(0);
  for (const [knob, percent] of Object.entries(knobs)) {
    expect(percent, knob).toBe(TONE_MIX_DEFAULTS[knob as keyof typeof TONE_MIX_DEFAULTS]);
  }
});

test("a mid-tone carried base emits the solved knobs, and the roles they spell clear every floor", () => {
  const { vars } = clampThemeTokens({ background: MID_BASE }, undefined, HEARTH_ACCENT);
  const knobs = emittedKnobs(vars);
  const scheme = carriedToneScheme(parsed(MID_BASE));
  const sources = carriedToneSources(scheme, parsed(vars["--color-primary"] ?? ""));
  expect(knobs).toEqual(
    Object.fromEntries(Object.keys(knobs).map((knob) => [knob, solveCarriedToneMix(scheme, sources).scope[knob as keyof typeof TONE_MIX_DEFAULTS]])),
  );
  expect(knobs["text"]).toBeLessThan(TONE_MIX_DEFAULTS.text);
  expect(knobs["neutral-active"]).toBeGreaterThan(TONE_MIX_DEFAULTS["neutral-active"]);
});

test("a carried scope paints the primary it judged, and reports when the solid steps needed the fallback", () => {
  const inherited = clampThemeTokens({ background: DARK_BASE }, undefined, HEARTH_ACCENT);
  expect(inherited.vars["--color-primary"]).toBe(HEARTH_ACCENT);
  expect(inherited.toneFallback).toBeUndefined();
  // Corrected up to clear the dark card, this fill lands where no one ink covers it and both solid steps.
  const shared = clampThemeTokens({ background: DARK_BASE, accent: "oklch(0.3 0.1 260)" });
  expect(shared.toneFallback?.accent).toBe(shared.vars["--color-primary"]);
  expect(shared.toneFallback?.active).toBeGreaterThan(TONE_MIX_DEFAULTS.active);
});
