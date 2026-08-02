// STRUCTURAL-PAIRING suite (mirror-exempt `.suite` kind — one property spanning three packages): the server
// seed-theme OVERRIDEs (`packages/server/src/domain/settings/seed-themes.ts`) must stay byte-equal to the
// @orb/ui palette values they mirror — Hearth ↔ the base `TOKENS` ramp, every other seed ↔ its
// `SEED_THEME_VALUE_SETS` vars (the same OKLCH theme.css emits as `[data-theme=…]` blocks). The cake forbids
// server↔ui imports, so this test is the ONLY thing that keeps the copies from drifting (the Hearth
// system-bubble fg once drifted 0.705 vs the AA-corrected 0.74 — W3). Tests may import both packages; the
// packages never import each other.
//
// THIRD copy, same property (2026-08-02): each default-character CARD carries its palette as its authored
// `themeOverride` (`domain/character/seeder/cards.ts`). domain→domain imports are illegal, so the card's
// colours are a literal mirror of the same value-set and are pinned here too — one drift gate for all three
// copies of a palette.
//
// The palette list is DERIVED from the SEED_THEMES registry (never a hand list), so a new seed palette is
// auto-covered; set-equality against the value-set jsons is asserted both ways at the bottom.
//
// Not pinned: chatStyle/density — those are template PREFS a user overrides when duplicating a seed, not
// palette values, so they carry no ui counterpart to pair against.

import type { ThemeOverride } from "@orb/contracts/theme";
import { DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { SEED_THEME_VALUE_SETS, TOKENS } from "@orb/ui/tokens";
import { describe } from "vitest";
import { THEME_HEARTH_NAME } from "../../../../packages/server/src/domain/settings/constants.ts";
import { SEED_THEMES } from "../../../../packages/server/src/domain/settings/seed-themes.ts";
import { expect, test } from "../../../support/fixtures";

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

// Card handle → the seed palette it wears. Declared HERE because the three copies live in packages that
// cannot import each other (ui ← contracts ← server-domain-settings ⊥ server-domain-character); this suite is
// the seam that holds them together. A card missing from this table fails the completeness test below, so a
// new default card cannot land unpaired.
const CARD_THEME_BY_HANDLE: Readonly<Record<string, string>> = {
  assistant: "Charlotte",
  "jfc-coder": "JFC",
  niko: "Niko",
  hana: "Hana",
  morgatha: "Morgatha",
  sabine: "Sabine",
  birdie: "Birdie",
  kohaku: "Kohaku",
  calamity: "Calamity",
  elias: "Elias",
};
const CARD_PALETTE_BY_THEME = new Map<string, ThemeOverride>(
  DEFAULT_CHARACTER_CARDS.flatMap((card) => {
    const override = card.presentation.themeOverride;
    const themeName = CARD_THEME_BY_HANDLE[card.input.handle];
    return override === null || override === undefined || themeName === undefined ? [] : [[themeName, override] as const];
  }),
);

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

describe("default-character CARD themeOverride ↔ the same palette (the third copy)", () => {
  for (const [themeName, cardOverride] of CARD_PALETTE_BY_THEME) {
    const authority = authorityFor(themeName);
    for (const { label, get, cssVar } of COLOR_FIELDS) {
      test(`card ${themeName}.${label} matches ${cssVar}`, () => {
        expect(get(cardOverride)).toBe(authority(cssVar));
      });
    }
  }

  test("every default card's palette is a REAL seed palette (card set ⊆ seed registry)", () => {
    const seedNames = new Set(SEED_THEMES.map((t) => t.name));
    for (const themeName of CARD_PALETTE_BY_THEME.keys()) {
      expect(seedNames.has(themeName), `${themeName} is a seeded palette`).toBe(true);
    }
    // And the pack is fully covered: one palette per card.
    expect(CARD_PALETTE_BY_THEME.size).toBe(DEFAULT_CHARACTER_CARDS.length);
  });
});
