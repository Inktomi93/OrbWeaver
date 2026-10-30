// The seeded theme overrides must stay equal to the @orb/ui palette values they mirror: Hearth against the base token ramp,
// every other seed against its generated value set. The server cannot import the ui package, so this suite is the only pairing.

import type { ThemeOverride } from "@orb/contracts/theme";
import { expect, test } from "@orb/testkit/node";
import { THEME_SCOPE_EMIT_VARS } from "@orb/ui/theme-scope/emit-vars";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { describe } from "vitest";
import { THEME_HEARTH_NAME } from "#server/domain/settings/constants.ts";
import { SEED_THEMES } from "#server/domain/settings/substrate/seed-themes.ts";

/** The pairing itself: each override colour field and the `--color-*` property it must equal. */
const COLOR_FIELDS: readonly { readonly label: string; readonly get: (override: ThemeOverride) => string | undefined; readonly cssVar: string }[] = [
  { label: "accent", get: (o) => o.accent, cssVar: "--color-primary" },
  { label: "speaker", get: (o) => o.speaker, cssVar: "--color-speaker" },
  { label: "dialogueColor", get: (o) => o.dialogueColor, cssVar: "--color-dialogue" },
  { label: "narrationColor", get: (o) => o.narrationColor, cssVar: "--color-narration" },
  { label: "bodyColor", get: (o) => o.bodyColor, cssVar: "--color-prose-body" },
  { label: "background", get: (o) => o.background, cssVar: "--color-background" },
  { label: "userBubble.bg", get: (o) => o.userBubble?.bg, cssVar: "--color-user-bubble" },
  { label: "userBubble.fg", get: (o) => o.userBubble?.fg, cssVar: "--color-user-bubble-foreground" },
  { label: "aiBubble.bg", get: (o) => o.aiBubble?.bg, cssVar: "--color-ai-bubble" },
  { label: "aiBubble.fg", get: (o) => o.aiBubble?.fg, cssVar: "--color-ai-bubble-foreground" },
  { label: "systemBubble.bg", get: (o) => o.systemBubble?.bg, cssVar: "--color-system-bubble" },
  { label: "systemBubble.fg", get: (o) => o.systemBubble?.fg, cssVar: "--color-system-bubble-foreground" },
];

// Hearth is the base palette: its values live in the token ramp, not in a [data-theme] value set.
const TOKEN_VALUE_BY_VAR = new Map<string, string>(Object.values(TOKENS).map((token) => [token.cssVar, token.value] as const));
const VALUE_SETS: Readonly<Record<string, { readonly vars: Readonly<Record<string, string>> }>> = SEED_THEME_VALUE_SETS;
const authorityFor = (name: string): ((cssVar: string) => string | undefined) =>
  name === THEME_HEARTH_NAME
    ? (cssVar): string | undefined => TOKEN_VALUE_BY_VAR.get(cssVar)
    : (cssVar): string | undefined => VALUE_SETS[name.toLowerCase()]?.vars[cssVar];

describe("each seeded override equals the ui palette it mirrors", () => {
  for (const { name, override } of SEED_THEMES) {
    test(`${name}: every colour field is set and equals its palette value`, () => {
      const authority = authorityFor(name);
      // An unset field on both sides would compare equal, so the control is that each field carries a real value.
      const unset = COLOR_FIELDS.filter(({ get, cssVar }) => get(override) === undefined || authority(cssVar) === undefined).map(({ label }) => label);
      expect(unset).toEqual([]);
      const drifted = COLOR_FIELDS.filter(({ get, cssVar }) => get(override) !== authority(cssVar)).map(({ label }) => label);
      expect(drifted).toEqual([]);
    });

    test(`${name}: the font and radius name tokens the base palette defines`, () => {
      expect(TOKENS["font.sans"].value.startsWith(`${override.font},`)).toBe(true);
      expect(`radius.${override.radius}` in TOKENS).toBe(true);
    });
  }

  test("every paired property is one the theme scope emits, so a renamed variable breaks the pairing here", () => {
    const emitted: readonly string[] = THEME_SCOPE_EMIT_VARS;
    expect(COLOR_FIELDS.map(({ cssVar }) => cssVar).filter((cssVar) => !emitted.includes(cssVar))).toEqual([]);
  });

  test("the ui value sets are exactly the seeds other than Hearth", () => {
    const byText = (a: string, b: string): number => a.localeCompare(b);
    const valueSetNames = Object.keys(SEED_THEME_VALUE_SETS).toSorted(byText);
    const seedNames = SEED_THEMES.map((seed) => seed.name.toLowerCase())
      .filter((name) => name !== THEME_HEARTH_NAME.toLowerCase())
      .toSorted(byText);
    expect(valueSetNames).toEqual(seedNames);
    expect(valueSetNames.length).toBeGreaterThan(0);
    expect(valueSetNames).not.toContain(THEME_HEARTH_NAME.toLowerCase());
  });
});
