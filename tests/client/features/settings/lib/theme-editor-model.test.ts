// lib/theme-editor-model — the global theme editor's flat-form ⇄ ThemeOverride mapper (D44 §12.1). The
// clear spine: a color field left empty ("" — the ColorField per-field clear, FINAL-Character §8.1) is
// OMITTED from the built override so <ThemeScope> derives/inherits that token rather than shipping a
// literal empty color. Enum fields (font/radius/style/density) are fixed-choice Selects, never cleared.
// DOM-free pure logic → a browser-free unit test (Spine-Testing.md §7); deep-imports the lib module.

import {
  DEFAULT_THEME_FORM,
  themeOverrideFromForm,
} from "../../../../../packages/client/src/features/settings/lib/theme-editor-model";
import { expect, test } from "../../../../support/fixtures";

test("a fully-populated form maps every token into the override", () => {
  const o = themeOverrideFromForm(DEFAULT_THEME_FORM);
  expect(o.background).toBe(DEFAULT_THEME_FORM.background);
  expect(o.accent).toBe(DEFAULT_THEME_FORM.accent);
  expect(o.speaker).toBe(DEFAULT_THEME_FORM.speaker);
  expect(o.userBubble).toEqual({ bg: DEFAULT_THEME_FORM.userBubbleBg });
  expect(o.aiBubble).toEqual({ bg: DEFAULT_THEME_FORM.aiBubbleBg });
  expect(o.systemBubble).toEqual({ bg: DEFAULT_THEME_FORM.systemBubbleBg });
  expect(o.font).toBe(DEFAULT_THEME_FORM.font);
  expect(o.radius).toBe(DEFAULT_THEME_FORM.radius);
});

test("a cleared color field ('') is OMITTED — the token inherits/derives via <ThemeScope>", () => {
  const o = themeOverrideFromForm({
    ...DEFAULT_THEME_FORM,
    background: "",
    accent: "",
    speaker: "",
  });
  expect("background" in o).toBe(false);
  expect("accent" in o).toBe(false);
  expect("speaker" in o).toBe(false);
  // The fields left set are untouched.
  expect(o.dialogueColor).toBe(DEFAULT_THEME_FORM.dialogueColor);
});

test("a cleared borderColor is omitted (the border derives from the base surface)", () => {
  const o = themeOverrideFromForm({ ...DEFAULT_THEME_FORM, borderColor: "" });
  expect("borderColor" in o).toBe(false);
});

test("a cleared bubble bg omits the whole bubble (it inherits)", () => {
  const o = themeOverrideFromForm({ ...DEFAULT_THEME_FORM, aiBubbleBg: "" });
  expect(o.aiBubble).toBeUndefined();
  // The other bubbles still carry their set bg.
  expect(o.userBubble).toEqual({ bg: DEFAULT_THEME_FORM.userBubbleBg });
});

test("enum fields are always present even when every color is cleared", () => {
  const o = themeOverrideFromForm({
    ...DEFAULT_THEME_FORM,
    background: "",
    accent: "",
    borderColor: "",
    speaker: "",
    dialogueColor: "",
    narrationColor: "",
    bodyColor: "",
    userBubbleBg: "",
    aiBubbleBg: "",
    systemBubbleBg: "",
  });
  expect(o).toEqual({
    font: DEFAULT_THEME_FORM.font,
    radius: DEFAULT_THEME_FORM.radius,
    chatStyle: DEFAULT_THEME_FORM.chatStyle,
    density: DEFAULT_THEME_FORM.density,
  });
});
