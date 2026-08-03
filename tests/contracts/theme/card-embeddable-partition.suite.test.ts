// The CARD-EMBEDDABLE partition suite (TD §3) — mirror-exempt `.suite` kind: ONE property spanning two
// contract modules (`theme` and `settings`), which is exactly what makes it un-homeable in either one's
// own contract test.
//
// The partition answers "what may a character card force on someone else's screen?": IDENTITY & ATMOSPHERE
// yes (colours, type family, corner language), ERGONOMICS/ACCESSIBILITY/COST/TREATMENT never. Three
// properties are pinned here, and each one is a real defect if it breaks:
//   (a) TOTAL + DISJOINT over `keyof ThemeOverride` — a NEW override field is RED until someone decides
//       which plane it belongs to. This is the whole point: the failure mode is a field silently arriving
//       card-forcible because nobody asked.
//   (b) the VOCABULARY OVERLAP with AppearanceSettings is exactly the deliberate set — the same word on
//       both planes means "the viewer's knob and the theme's knob", and an accidental third overlap is a
//       key someone half-moved.
//   (c) `cardEmbeddableSubset` actually PROJECTS — present keys survive, sacred keys drop, absent keys
//       stay absent (the CSS cascade needs the absence, not an explicit undefined).
// The ThemeBackground side is pinned too: its treatment fields (fit/dim/blur) are not even spellable on a
// card, which is the partition's first wall — physics before projection.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import { CARD_EMBEDDABLE_THEME_KEYS, cardEmbeddableSubset, themeBackgroundSchema, themeOverrideSchema, VIEWER_SACRED_THEME_KEYS } from "@orb/contracts/theme";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

/** The two deliberate word-shares between the card-carriable plane and the viewer's own settings blob. */
const DELIBERATE_VOCABULARY_OVERLAP = ["density"];

describe("the card-embeddable partition of ThemeOverride", () => {
  test("every override key is classified — the two halves are TOTAL and DISJOINT", () => {
    const byText = (a: string, b: string): number => a.localeCompare(b);
    const classified = [...CARD_EMBEDDABLE_THEME_KEYS, ...VIEWER_SACRED_THEME_KEYS];
    expect([...classified].sort(byText)).toEqual(Object.keys(themeOverrideSchema.shape).sort(byText));
    expect(new Set(classified).size, "a key cannot sit on both planes").toBe(classified.length);
  });

  test("the viewer-sacred half is exactly the ergonomics axis (density), and it is NOT card-embeddable", () => {
    expect([...VIEWER_SACRED_THEME_KEYS]).toEqual(["density"]);
    expect(CARD_EMBEDDABLE_THEME_KEYS).not.toContain("density");
  });

  test("chatStyle is not on the override at all — it is the viewer's setting, not a theme axis", () => {
    expect("chatStyle" in themeOverrideSchema.shape).toBe(false);
    // …and it still exists where it belongs: the appearance blob.
    expect(DEFAULT_APPEARANCE_SETTINGS.chatStyle).toBe("bubble");
  });

  test("the vocabulary shared with AppearanceSettings is exactly the deliberate set", () => {
    const appearanceKeys = new Set(Object.keys(DEFAULT_APPEARANCE_SETTINGS satisfies AppearanceSettings));
    const overlap = Object.keys(themeOverrideSchema.shape).filter((key) => appearanceKeys.has(key));
    expect(overlap.sort()).toEqual([...DELIBERATE_VOCABULARY_OVERLAP].sort());
  });
});

describe("cardEmbeddableSubset — the ONE projection every card-sourced read runs", () => {
  test("keeps the card's look, drops the viewer's ergonomics", () => {
    const authored: ThemeOverride = {
      accent: "oklch(0.72 0.175 52)",
      aiBubble: { bg: "oklch(0.21 0.01 60)", fg: "oklch(0.95 0.01 60)" },
      font: "Georgia",
      radius: "full",
      density: "compact",
    };
    expect(cardEmbeddableSubset(authored)).toEqual({
      accent: "oklch(0.72 0.175 52)",
      aiBubble: { bg: "oklch(0.21 0.01 60)", fg: "oklch(0.95 0.01 60)" },
      font: "Georgia",
      radius: "full",
    });
  });

  test("an ABSENT key stays absent — the projection never materializes undefined slots", () => {
    // Load-bearing: `clampThemeTokens` emits only present fields, so the CSS custom-property cascade is
    // what merges character over global. An explicit `accent: undefined` would still be a key here.
    const subset = cardEmbeddableSubset({ accent: "#c98a5b" });
    expect(Object.keys(subset)).toEqual(["accent"]);
  });

  test("an override of nothing but sacred keys projects to EMPTY (nothing to paint)", () => {
    expect(cardEmbeddableSubset({ density: "compact" })).toEqual({});
  });
});

describe("the ThemeBackground side — treatment is unspellable on a card (physics, not projection)", () => {
  test("fit/dim/blur are not carried-schema fields; the SOURCE fields are", () => {
    const carried = Object.keys(themeBackgroundSchema.shape);
    for (const treatment of ["backgroundFit", "backgroundDim", "backgroundBlur", "fit", "dim", "blur"]) {
      expect(carried, `${treatment} must not be carriable`).not.toContain(treatment);
    }
    expect(carried).toContain("kind");
  });

  test("…and those treatment knobs live on the viewer's own settings blob", () => {
    expect(DEFAULT_APPEARANCE_SETTINGS.backgroundFit).toBeDefined();
    expect(DEFAULT_APPEARANCE_SETTINGS.backgroundDim).toBeDefined();
    expect(DEFAULT_APPEARANCE_SETTINGS.backgroundBlur).toBeDefined();
  });
});
