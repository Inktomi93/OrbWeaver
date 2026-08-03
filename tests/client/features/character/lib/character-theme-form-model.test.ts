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
} from "../../../../../packages/client/src/features/character/lib/character-theme-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// A fully-populated CARD override — every colour scalar, both slots of every bubble, and both enums the
// card can carry. `density` is deliberately absent: it is viewer-sacred (TD §3), so this form has no field
// for it and a card can never author one (see the stripping test below).
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

test("a VIEWER-SACRED key on a stale blob is dropped by the round-trip, never re-authored", () => {
  // A card written before the partition (or by a hand-posted blob) can carry `density`. The form has no
  // field for it, so the next autosave writes it out of existence — derive-don't-migrate.
  const stale: ThemeOverride = { accent: "#c98a5b", density: "compact" };
  expect(overrideFromCharacterThemeForm(characterThemeFormFromOverride(stale))).toEqual({ accent: "#c98a5b" });
});

test("a bubble keeps only its set slot (bg without fg, and vice-versa)", () => {
  const bgOnly = { ...EMPTY_CHARACTER_THEME_FORM, aiBubbleBg: "#1a1a20" };
  expect(overrideFromCharacterThemeForm(bgOnly)).toEqual({ aiBubble: { bg: "#1a1a20" } });

  const fgOnly = { ...EMPTY_CHARACTER_THEME_FORM, userBubbleFg: "#ffffff" };
  expect(overrideFromCharacterThemeForm(fgOnly)).toEqual({ userBubble: { fg: "#ffffff" } });
});
