// The seeded theme overrides must stay equal to the @orb/ui palette values they mirror: Hearth against the base token ramp,
// every other seed against its generated value set. The server cannot import the ui package, so this suite is the only pairing.

import type { ThemeOverride } from "@orb/contracts/theme";
import { isPlainObject } from "@orb/kit/guards";
import { expect, test } from "@orb/testkit/node";
import { THEME_OVERRIDE_COLOR_VARS, THEME_SCOPE_EMIT_VARS } from "@orb/ui/theme-scope/emit-vars";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { describe } from "vitest";
import { THEME_HEARTH_ID, THEME_HEARTH_NAME, THEME_LIGHT_ID, THEME_LIGHT_NAME, THEME_MOCHA_ID, THEME_MOCHA_NAME } from "#server/domain/settings/constants.ts";
import { SEED_THEMES } from "#server/domain/settings/substrate/seed-themes.ts";

type ColourField = Exclude<keyof ThemeOverride, "font" | "radius" | "density">;
type ColourVars = string | { readonly bg: string; readonly fg: string };
// The ui table is the pairing: an override colour field the contract gains fails `tsc` here until the table names its
// property.
const COLOUR_VARS: Readonly<Record<ColourField, ColourVars>> = THEME_OVERRIDE_COLOR_VARS;

function readPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), value);
}

interface ColourPairing {
  readonly label: string;
  readonly path: readonly string[];
  readonly cssVar: string;
}

// A seed override carries no `borderColor`: the border derives from its background, so it has no pick to pair.
const COLOR_FIELDS: readonly ColourPairing[] = Object.entries(COLOUR_VARS)
  .filter(([field]) => field !== "borderColor")
  .flatMap(([field, vars]): ColourPairing[] =>
    typeof vars === "string"
      ? [{ label: field, path: [field], cssVar: vars }]
      : [
          { label: `${field}.bg`, path: [field, "bg"], cssVar: vars.bg },
          { label: `${field}.fg`, path: [field, "fg"], cssVar: vars.fg },
        ],
  );

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
      const unset = COLOR_FIELDS.filter(({ path, cssVar }) => readPath(override, path) === undefined || authority(cssVar) === undefined).map(
        ({ label }) => label,
      );
      expect(unset).toEqual([]);
      const drifted = COLOR_FIELDS.filter(({ path, cssVar }) => readPath(override, path) !== authority(cssVar)).map(({ label }) => label);
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

  test("the shipped set is Hearth, Mocha and Light, in that order, under their sentinel ids", () => {
    expect(SEED_THEMES.map(({ id, name }) => [id, name])).toEqual([
      [THEME_HEARTH_ID, THEME_HEARTH_NAME],
      [THEME_MOCHA_ID, THEME_MOCHA_NAME],
      [THEME_LIGHT_ID, THEME_LIGHT_NAME],
    ]);
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
