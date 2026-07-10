// lib/character-theme-form-model — the §8.1 per-character theme mappers (FINAL-Character §8). The SPARSE
// discipline is the correctness spine: a sentinel field (empty colour / `inherit` enum) is OMITTED so the
// token inherits (§8.2), and an all-inherit form collapses to `null` (no override), never an empty `{}`.
// DOM-free pure logic → a browser-free unit test (Spine-Testing.md §7). Deep-imports the pure lib module
// (NOT the feature barrel — a barrel drags browser TSX into the dom-less typecheck:graph; the
// character-card-form-model.test precedent).

import type { ThemeOverride } from "@orb/contracts/theme";
import {
  characterThemeFormFromOverride,
  EMPTY_CHARACTER_THEME_FORM,
  overrideFromCharacterThemeForm,
} from "../../../../../packages/client/src/features/character/lib/character-theme-form-model";
import { expect, test } from "../../../../support/fixtures";

// A fully-populated override — every colour scalar, both slots of every bubble, and all four enums set.
const FULL: ThemeOverride = {
  background: "#101014",
  accent: "#c98a5b",
  borderColor: "#333340",
  speaker: "#c98a5b",
  dialogueColor: "#f4f0ea",
  narrationColor: "#c8c2b8",
  bodyColor: "#e6e0d6",
  userBubble: { bg: "#26262e", fg: "#ffffff" },
  aiBubble: { bg: "#1a1a20", fg: "#f0f0f0" },
  systemBubble: { bg: "#242430", fg: "#d0d0d0" },
  font: "Georgia",
  radius: "card",
  chatStyle: "echo",
  density: "compact",
};

test("round-trips a fully-populated override through the flat form unchanged", () => {
  const form = characterThemeFormFromOverride(FULL);
  expect(overrideFromCharacterThemeForm(form)).toEqual(FULL);
});

test("null seed maps to the all-inherit form, and back to null", () => {
  expect(characterThemeFormFromOverride(null)).toEqual(EMPTY_CHARACTER_THEME_FORM);
  expect(overrideFromCharacterThemeForm(EMPTY_CHARACTER_THEME_FORM)).toBeNull();
});

test("a sentinel field is OMITTED — the token inherits, the set fields survive", () => {
  const form = {
    ...EMPTY_CHARACTER_THEME_FORM,
    accent: "#c98a5b",
    radius: "card",
    // font stays `inherit`, every other colour stays "" → all omitted.
  };
  expect(overrideFromCharacterThemeForm(form)).toEqual({ accent: "#c98a5b", radius: "card" });
});

test("a bubble keeps only its set slot (bg without fg, and vice-versa)", () => {
  const bgOnly = { ...EMPTY_CHARACTER_THEME_FORM, aiBubbleBg: "#1a1a20" };
  expect(overrideFromCharacterThemeForm(bgOnly)).toEqual({ aiBubble: { bg: "#1a1a20" } });

  const fgOnly = { ...EMPTY_CHARACTER_THEME_FORM, userBubbleFg: "#ffffff" };
  expect(overrideFromCharacterThemeForm(fgOnly)).toEqual({ userBubble: { fg: "#ffffff" } });
});
