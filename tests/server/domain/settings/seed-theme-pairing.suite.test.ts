// STRUCTURAL-PAIRING suite (mirror-exempt `.suite` kind — one property spanning three packages): the server
// seed-theme OVERRIDEs (`packages/server/src/domain/settings/seed-themes.ts`) must stay byte-equal to the
// @orb/ui palette values they mirror — Hearth ↔ the base `TOKENS` ramp, every other seed ↔ its
// `SEED_THEME_VALUE_SETS` vars (the same OKLCH theme.css emits as `[data-theme=…]` blocks). The cake forbids
// server↔ui imports, so this test is the ONLY thing that keeps the copies from drifting (the Hearth
// system-bubble fg once drifted 0.705 vs the AA-corrected 0.74 — W3). Tests may import both packages; the
// packages never import each other.
//
// There WAS a third copy: each default-character card carried the same palette as its authored
// `themeOverride`, pinned here byte-equal. The picker curation (TD/O-9) retired those ten value-sets, so
// the card is now the ONLY copy of its palette and has nothing to pair against — the surviving invariant
// (a complete palette, card-embeddable keys only) is pinned self-contained at
// `tests/server/domain/character/seeder/cards.contract.test.ts`.
//
// The palette list is DERIVED from the SEED_THEMES registry (never a hand list), so a new seed palette is
// auto-covered; set-equality against the value-set jsons is asserted both ways at the bottom.
//
// Not pinned: density — a template PREF a user overrides when duplicating a seed, not a palette value, so
// it carries no ui counterpart to pair against.

import type { ThemeOverride } from "@orb/contracts/theme";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { describe } from "vitest";
import { THEME_HEARTH_NAME } from "../../../../packages/server/src/domain/settings/constants.ts";
import { SEED_THEMES } from "../../../../packages/server/src/domain/settings/seed-themes.ts";
import { expect, test } from "../../../support/fixtures.ts";

// The colour field mapping, declared ONCE: each seed override colour field → the `--color-*` custom
// property it must equal. Bubbles are nested {bg,fg}; the rest are flat strings.
const COLOR_FIELDS: ReadonlyArray<{ label: string; get: (o: ThemeOverride) => string | undefined; cssVar: string }> = [
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

// Hearth's authority is the base TOKENS ramp — resolve a `--color-*` var to its value via TOKENS.
const TOKENS_BY_CSSVAR = new Map<string, string>(Object.values(TOKENS).map((t) => [t.cssVar, t.value] as const));
const hearthValue = (cssVar: string): string | undefined => TOKENS_BY_CSSVAR.get(cssVar);
const VALUE_SETS: Readonly<Record<string, { readonly vars: Readonly<Record<string, string>> }>> = SEED_THEME_VALUE_SETS;
const seedSetValue = (name: string, cssVar: string): string | undefined => VALUE_SETS[name.toLowerCase()]?.vars[cssVar];
/** Hearth IS the base palette (no value-set of its own); every other seed pairs against its json. */
const authorityFor = (name: string): ((cssVar: string) => string | undefined) =>
  name === THEME_HEARTH_NAME ? hearthValue : (cssVar): string | undefined => seedSetValue(name, cssVar);

describe("seed-theme OVERRIDE ↔ @orb/ui palette pairing (W3)", () => {
  for (const { name, override } of SEED_THEMES) {
    const authority = authorityFor(name);
    for (const { label, get, cssVar } of COLOR_FIELDS) {
      test(`${name}.${label} matches ${cssVar}`, () => {
        expect(get(override)).toBe(authority(cssVar));
      });
    }

    // font/radius are structural, not palette-hued: the override must name the base token stack's family.
    test(`${name} font names the --font-sans family`, () => {
      expect(override.font).toBe("Geist");
      expect(TOKENS["font.sans"].value.startsWith(`${override.font},`)).toBe(true);
    });
    test(`${name} radius names a real radius token`, () => {
      expect(override.radius).toBe("card");
      expect(`radius.${override.radius}` in TOKENS).toBe(true);
    });
  }

  // Registry set-equality: every @orb/ui value-set must have a matching seeded server row and vice versa.
  // Hearth is exempt — it IS the base palette (its values live in TOKENS, not a [data-theme] value-set), so
  // the value-set names must equal exactly the lowercased NON-Hearth seed names. A value-set json with no
  // server seed row (or a new seed row with no value-set) goes red here.
  // The RETIRED palettes (TD/O-9) must stay retired in BOTH directions — a json coming back without its
  // seeder row, or a seeder row without its json, is what this set-equality already catches; this names
  // the specific regression so the next reader knows the shrink was deliberate, not a deletion accident.
  test("the shipped set is the D62 three — the ten character palettes are gone from both sides", () => {
    expect(SEED_THEMES.map((t) => t.name)).toEqual(["Hearth", "Mocha", "Light"]);
    expect(Object.keys(SEED_THEME_VALUE_SETS).sort()).toEqual(["light", "mocha"]);
  });

  test("SEED_THEME_VALUE_SETS names == the lowercased non-Hearth seed names", () => {
    const byText = (a: string, b: string): number => a.localeCompare(b);
    const valueSetNames = Object.keys(SEED_THEME_VALUE_SETS).sort(byText);
    const seedNames = SEED_THEMES.map((t) => t.name.toLowerCase())
      .filter((n) => n !== THEME_HEARTH_NAME.toLowerCase())
      .sort(byText);
    expect(valueSetNames).toEqual(seedNames);
    // Hearth is the base palette (its values live in TOKENS), so it must NOT appear as a value-set.
    expect(valueSetNames).not.toContain(THEME_HEARTH_NAME.toLowerCase());
  });
});
