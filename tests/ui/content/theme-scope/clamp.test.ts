import { AA_NORMAL_RATIO, carriedLiteralRoles, carriedReadingHosts, oklchToSrgb, proseInkCorrection, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { expect, test } from "@orb/testkit/node";
import type { ToneMixKnob } from "@orb/ui/tokens";
import { SEED_THEME_VALUE_SETS, TOKENS, TONE_MIX_DEFAULTS, TONE_MIX_KNOBS, TONE_ROLE_RECIPES, TONES, toneKnobVar, toneLiteralVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { toOklch } from "../../../../packages/ui/src/content/theme-scope/color-parse.ts";
import { carriedPaletteOf } from "../../../../packages/ui/src/content/theme-scope/derive-vars.ts";
import { carriedToneScheme, carriedToneSources, MIX_FALLBACK, solveCarriedToneMix } from "../../../../packages/ui/src/content/theme-scope/tone-knobs.ts";
import { HEARTH_ACCENT, parsed } from "./tone-scope-misses.ts";

const DARK_BASE = "oklch(0.158 0.006 60)";
const MID_BASE = "oklch(0.5 0.01 60)";
const KNOB_VARS = new Map<string, ToneMixKnob>(TONE_MIX_KNOBS.map((knob) => [TOKENS[`tone-mix.${knob}`].cssVar, knob] as const));
const LITERAL_ROLES = carriedLiteralRoles(TONE_ROLE_RECIPES, TONE_MIX_DEFAULTS);
const LITERAL_VARS: readonly string[] = TONES.flatMap((tone) => (tone === "neutral" ? [] : LITERAL_ROLES.map((role) => toneLiteralVar(tone, role))));

function emittedKnobs(vars: Readonly<Record<string, string>>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(vars).flatMap(([name, value]) => {
      const knob = KNOB_VARS.get(name);
      return knob === undefined ? [] : [[knob, Number.parseFloat(value)] as const];
    }),
  );
}

test("a scope with no carried background emits no tone knob, so the cascade keeps the outer solve", () => {
  expect(emittedKnobs(clampThemeTokens({ accent: "oklch(0.6 0.2 300)" }, DARK_BASE, HEARTH_ACCENT).vars)).toEqual({});
});

test("a dark carried base emits every solved knob at its default", () => {
  const knobs = emittedKnobs(clampThemeTokens({ background: DARK_BASE }, undefined, HEARTH_ACCENT).vars);
  expect(Object.keys(knobs).length).toBeGreaterThan(0);
  const defaults: Readonly<Record<string, number>> = TONE_MIX_DEFAULTS;
  for (const [knob, percent] of Object.entries(knobs)) {
    expect(percent, knob).toBe(defaults[knob]);
  }
});

test("a mid-tone carried base emits the solved knobs, and the roles they spell clear every floor", () => {
  const { vars } = clampThemeTokens({ background: MID_BASE }, undefined, HEARTH_ACCENT);
  const knobs = emittedKnobs(vars);
  const scheme = carriedToneScheme(carriedPaletteOf(parsed(MID_BASE)));
  const sources = carriedToneSources(scheme, parsed(vars[TOKENS["color.primary"].cssVar] ?? ""));
  const solved: Readonly<Record<string, number>> = solveCarriedToneMix(scheme, sources).scope;
  expect(knobs).toEqual(Object.fromEntries(Object.keys(knobs).map((knob) => [knob, solved[knob]] as const)));
  expect(knobs["text"]).toBeLessThan(TONE_MIX_DEFAULTS.text);
  expect(knobs["neutral-active"]).toBeGreaterThan(TONE_MIX_DEFAULTS["neutral-active"]);
});

function literalVars(vars: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(vars).filter(([name]) => LITERAL_VARS.includes(name)));
}

test("a carried scope emits every tone literal: a colour for each tone it judges, the mix fallback for a primary it cannot", () => {
  const judged = literalVars(clampThemeTokens({ background: MID_BASE }, undefined, HEARTH_ACCENT).vars);
  expect(Object.keys(judged).toSorted()).toEqual([...LITERAL_VARS].toSorted());
  expect(Object.values(judged).filter((value) => toOklch(value) === null)).toEqual([]);
  const unknownPrimary = literalVars(clampThemeTokens({ background: MID_BASE }).vars);
  expect(Object.keys(unknownPrimary).toSorted()).toEqual([...LITERAL_VARS].toSorted());
  for (const role of LITERAL_ROLES) {
    expect(unknownPrimary[toneLiteralVar("primary", role)], role).toBe(MIX_FALLBACK);
    expect(toOklch(unknownPrimary[toneLiteralVar("warning", role)] ?? ""), role).not.toBeNull();
  }
});

test("a scope that paints its own accent over a seed palette resets the primary literals, and an ink-only scope emits none", () => {
  const accentOnly = literalVars(clampThemeTokens({ accent: "oklch(0.6 0.2 300)" }, MID_BASE, HEARTH_ACCENT).vars);
  expect(accentOnly).toEqual(Object.fromEntries(LITERAL_ROLES.map((role) => [toneLiteralVar("primary", role), MIX_FALLBACK])));
  expect(literalVars(clampThemeTokens({ dialogueColor: "oklch(0.8 0.1 90)" }, MID_BASE, HEARTH_ACCENT).vars)).toEqual({});
});

test("an accent-only scope over a carried palette emits its primary alone, so every other tone keeps the outer solve", () => {
  const { vars } = clampThemeTokens({ accent: "oklch(0.6 0.2 300)" }, MID_BASE, HEARTH_ACCENT, { palette: "carried" });
  const primaryLiterals = LITERAL_ROLES.map((role) => toneLiteralVar("primary", role));
  const primarySteps = ["hover", "active"] as const satisfies readonly ToneMixKnob[];
  expect(Object.keys(vars).toSorted()).toEqual(
    [
      TOKENS["color.primary"].cssVar,
      TOKENS["color.ring"].cssVar,
      TOKENS["color.primary-foreground"].cssVar,
      ...primaryLiterals,
      ...primarySteps.map((knob) => toneKnobVar("primary", knob)),
    ].toSorted(),
  );
  expect(primaryLiterals.filter((name) => toOklch(vars[name] ?? "") === null)).toEqual([]);
});

test("a carried scope paints the primary it judged, and reports when the solid steps needed the fallback", () => {
  const inherited = clampThemeTokens({ background: DARK_BASE }, undefined, HEARTH_ACCENT);
  expect(inherited.vars[TOKENS["color.primary"].cssVar]).toBe(HEARTH_ACCENT);
  expect(inherited.toneFallback).toBeUndefined();
  // Corrected up to clear the dark card, this fill lands where no one ink covers it and both solid steps.
  const shared = clampThemeTokens({ background: DARK_BASE, accent: "oklch(0.3 0.1 260)" });
  expect(shared.toneFallback?.accent).toBe(shared.vars[TOKENS["color.primary"].cssVar]);
  expect(shared.toneFallback?.active).toBeGreaterThan(TONE_MIX_DEFAULTS.active);
});

test("an ink-only scope over a seed base is judged on that base's reading hosts, and moves only as far as they need", () => {
  const ink = "oklch(0.55 0.08 60)";
  const page = parsed("oklch(0.98 0.004 75)");
  expect(proseInkCorrection(parsed(ink), 1, page)).toBeNull();
  const emitted = clampThemeTokens({ dialogueColor: ink }, "oklch(0.98 0.004 75)").vars[TOKENS["color.dialogue"].cssVar] ?? "";
  const lightness = Number(/ ([\d.]+) c h \/ 1\)$/u.exec(emitted)?.[1]);
  expect(lightness).toBeLessThan(0.55);
  expect(lightness).toBeGreaterThan(0.5);
});

test("a carried scope that spells a seed's base judges its inks on the hosts it derives, not the seed's retuned ones", () => {
  const seedBase = SEED_THEME_VALUE_SETS.light.vars[TOKENS["color.background"].cssVar];
  const base = parsed(seedBase);
  const ink = parsed("oklch(0.6 0.05 60)");
  const hosts = carriedReadingHosts({ l: base.l, c: base.c, h: base.h });
  const fix = proseInkCorrection({ l: ink.l, c: ink.c, h: ink.h }, 1, { l: base.l, c: base.c, h: base.h }, hosts);
  const emitted = (palette: "seed" | "carried"): number =>
    Number(
      / ([\d.]+) c h \/ 1\)$/u.exec(
        clampThemeTokens({ dialogueColor: "oklch(0.6 0.05 60)" }, seedBase, undefined, { palette }).vars[TOKENS["color.dialogue"].cssVar] ?? "",
      )?.[1],
    );
  expect(emitted("carried")).toBe(fix?.l);
  expect(emitted("seed")).not.toBe(fix?.l);
});

const BOX_AMBIENTS = [
  { name: "none", background: undefined, palette: "seed" },
  { name: "seed", background: SEED_THEME_VALUE_SETS.light.vars[TOKENS["color.background"].cssVar], palette: "seed" },
  { name: "carried dark", background: "oklch(0.2 0.02 300)", palette: "carried" },
  { name: "carried light", background: "oklch(0.95 0.01 90)", palette: "carried" },
  { name: "carried mid", background: "oklch(0.55 0.02 60)", palette: "carried" },
] as const;

test("an accent picked inside a bubble's box holds the text floor on the fill, whatever the room around it", () => {
  const misses: string[] = [];
  for (const ambient of BOX_AMBIENTS) {
    for (const fill of ["oklch(0.9 0.02 90)", "oklch(0.34 0.06 35)", "oklch(0.6 0.04 30)"]) {
      for (const pick of ["oklch(0.7 0.2 260)", "oklch(0.3 0.1 260)", "oklch(0.55 0.2 30)"]) {
        const { vars, accentSource } = clampThemeTokens({ accent: pick }, ambient.background, undefined, { palette: ambient.palette, inside: fill });
        const painted = parsed(vars[TOKENS["color.primary"].cssVar] ?? "");
        const ratio = wcagContrastRatio(oklchToSrgb(painted), oklchToSrgb(parsed(fill)));
        if (ratio < AA_NORMAL_RATIO || accentSource !== pick) {
          misses.push(`${ambient.name} ${fill} ${pick} ${ratio.toFixed(2)} source ${accentSource}`);
        }
      }
    }
  }
  expect(misses).toEqual([]);
});

test("a picked fill restates its inks on its own box and leaves the scope's vars to the page", () => {
  const page = "oklch(0.158 0.006 60)";
  const narrationVar = TOKENS["color.narration"].cssVar;
  const inks = { narrationColor: "oklch(0.67 0.03 260)" };
  const clamped = clampThemeTokens({ aiBubble: { bg: "oklch(0.34 0.06 35)" } }, page, undefined, { palette: "carried", inks });
  expect(clamped.vars[narrationVar]).toBeUndefined();
  expect(clamped.vars[TOKENS["color.muted"].cssVar]).toBeUndefined();
  expect(clamped.bubbleScopes.assistant?.vars[narrationVar]).toContain("oklch(from");
  expect(Object.keys(clamped.bubbleScopes.assistant?.vars ?? {})).toContain(TOKENS["color.muted-foreground"].cssVar);
  expect(clamped.bubbleScopes.user).toBeUndefined();
  expect(
    clampThemeTokens({ aiBubble: { bg: "oklch(0.2 0.02 35)" } }, page, undefined, { palette: "carried", inks }).bubbleScopes.assistant?.vars[narrationVar],
  ).toBe(inks.narrationColor);
});
