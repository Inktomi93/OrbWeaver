// THEME_SCOPE_EMIT_VARS is a claim about the clamp: it lists exactly the custom properties a ThemeScope writes, each
// one a served token or a generated tone variable, and it never splits a surface from its paired ink or edge.
import { expect, test } from "@orb/testkit/node";
import { TOKENS, TONE_HOST_VAR, TONE_MIX_KNOBS, TONE_ROLES, TONES, toneKnobVar, toneLiteralVar } from "@orb/ui/tokens";
import { clampThemeTokens } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { THEME_SCOPE_EMIT_VARS } from "../../../../packages/ui/src/content/theme-scope/emit-vars.ts";
import { HEARTH_ACCENT } from "./tone-scope-misses.ts";

const ROSTER: ReadonlySet<string> = new Set(THEME_SCOPE_EMIT_VARS);

/** Every override field set to a value the clamp keeps, so the scope writes its whole surface. */
const FULL_OVERRIDE = {
  accent: "oklch(0.6 0.2 300)",
  userBubble: { bg: "oklch(0.4 0.1 200)" },
  aiBubble: { bg: "oklch(0.3 0.05 140)" },
  systemBubble: { bg: "oklch(0.35 0.03 90)" },
  speaker: "oklch(0.8 0.12 30)",
  dialogueColor: "oklch(0.82 0.1 210)",
  narrationColor: "oklch(0.78 0.05 120)",
  bodyColor: "oklch(0.9 0.02 60)",
  font: "Georgia",
  radius: "control",
  background: "oklch(0.5 0.01 60)",
  borderColor: "oklch(0.7 0.1 330)",
  density: "compact",
} as const;

/** The custom properties the generated token surface names: every served token, every per-tone knob and literal, and the tone host. */
function generatedVars(): ReadonlySet<string> {
  const colored = TONES.filter((tone) => tone !== "neutral");
  return new Set([
    ...Object.values(TOKENS).map((token) => token.cssVar),
    TONE_HOST_VAR,
    ...colored.flatMap((tone) => TONE_MIX_KNOBS.map((knob) => toneKnobVar(tone, knob))),
    ...colored.flatMap((tone) => TONE_ROLES.map((role) => toneLiteralVar(tone, role))),
  ]);
}

test("a scope with every field set writes exactly the emit roster", () => {
  for (const background of ["oklch(0.158 0.006 60)", FULL_OVERRIDE.background, "oklch(0.98 0.004 75)"]) {
    const { vars } = clampThemeTokens({ ...FULL_OVERRIDE, background }, undefined, HEARTH_ACCENT);
    expect(Object.keys(vars).toSorted(), background).toEqual([...THEME_SCOPE_EMIT_VARS].toSorted());
  }
});

test("every roster member is a variable the generated token surface names", () => {
  const generated = generatedVars();
  expect(THEME_SCOPE_EMIT_VARS.filter((name) => !generated.has(name))).toEqual([]);
});

test("a served surface and its paired ink or edge are both re-derived by a carried scope, or neither is", () => {
  const colors = new Set(Object.values(TOKENS).flatMap(({ cssVar }) => (cssVar.startsWith("--color-") ? [cssVar] : [])));
  const pairs = [...colors].flatMap((surface) =>
    ["foreground", "border"].flatMap((suffix) => (colors.has(`${surface}-${suffix}`) ? [[surface, `${surface}-${suffix}`]] : [])),
  );
  expect(pairs.length).toBeGreaterThan(0);
  const split = pairs.filter(([surface = "", paired = ""]) => ROSTER.has(surface) !== ROSTER.has(paired));
  expect(split).toEqual([]);
});
