// CT: the macro-textarea seal — a native multiline TEXTBOX that owns a listbox popup while typing a
// macro (side-eye F-3, 2026-08-03: `role=combobox` was unconditional, which overrode the native textbox
// role, killed `aria-multiline`, and made the accessible NAME fall through to the 60-word value). Typing `{{` opens a
// fuzzy-filtered popover of macro suggestions; ArrowUp/Down + Enter/Tab insert with cursor
// reposition; Esc closes leaving value + focus alone; an empty suggestion set never opens a
// popover. Real keystrokes via pressSequentially/press so the trigger-detection logic (wired off
// the real DOM `selectionStart`) fires exactly as it would for a user.
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import {
  BlockSuggestionsStory,
  DerivedSuggestionsStory,
  EmptySuggestionsStory,
  FieldWrappedStory,
  GhostDefaultStory,
  MacroTextareaStory,
} from "./macro-textarea.fixtures";

const NON_EMPTY = /.+/u;
/** ANY value — used with `not.toHaveAttribute` to assert an attribute is ABSENT, whatever it holds. */
const ANY_VALUE = /.*/u;
const SUGGESTION_STATUS_RE = /macro suggestions/u;

test("typing `{{` opens a filtered popover", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{cha");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  await expect(page.getByRole("option", { name: "{{user}}" })).toHaveCount(0);
});

test("controlled value/onChange: plain typing with no trigger round-trips through the parent", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("hello world");
  await expect(textarea).toHaveValue("hello world");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("ArrowDown moves the highlight, Enter inserts and repositions the caret at the end", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  // Bare `{{` lists the first MAX_SUGGESTIONS unfiltered, in catalog order: char, user, time,
  // getvar::name — char is highlighted by default (index 0); ArrowDown moves to user (index 1).
  await expect(page.getByRole("option", { name: "{{user}}" })).toBeVisible();
  await textarea.press("ArrowDown");
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("{{user}}");
  // Caret reposition: typing right after insertion lands at the very END, not mid-string.
  await textarea.pressSequentially("!");
  await expect(textarea).toHaveValue("{{user}}!");
});

test("Tab also inserts the highlighted macro", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{ti");
  await expect(page.getByRole("option", { name: "{{time}}" })).toBeVisible();
  await textarea.press("Tab");
  await expect(textarea).toHaveValue("{{time}}");
});

test("Escape closes the popover, leaving value and focus untouched", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{ch");
  await expect(page.getByRole("listbox")).toBeVisible();
  await textarea.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(textarea).toHaveValue("{{ch");
  await expect(textarea).toBeFocused();
});

test("an empty suggestion set never opens a popover", async ({ mount, page }) => {
  await mount(<EmptySuggestionsStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{anything");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("adjacent same-category suggestions group under ONE header", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  // char + user are adjacent "Character" entries — ONE header, not two.
  await expect(page.getByText("Character", { exact: true })).toHaveCount(1);
  await expect(page.getByText("System", { exact: true })).toBeVisible();
  await expect(page.getByText("Variables", { exact: true })).toBeVisible();
});

test("a parameterized macro inserts the `::` template and shows the arg hint", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{getv");
  await expect(page.getByRole("option", { name: "getvar::name" })).toBeVisible();
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("{{getvar::}}");
  const hint = page.locator('[data-slot="macro-textarea-arg-hint"]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("name");
  // Caret reposition: it sits just inside the closing braces, not at the string's end.
  await textarea.pressSequentially("x");
  await expect(textarea).toHaveValue("{{getvar::x}}");
});

test("a BLOCK suggestion inserts the whole `{{if}}…{{/if}}` pair with the caret at the predicate", async ({ mount, page }) => {
  await mount(<BlockSuggestionsStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{if");
  await expect(page.getByRole("option", { name: "{{if}}" })).toBeVisible();
  await textarea.press("Enter");
  // The whole pair — a bare `{{if}}` here is the defect this arm exists for (an unclosed block renders
  // as literal text in the prompt).
  await expect(textarea).toHaveValue("{{if::}}{{/if}}");
  // And the caret is where the author must type next: the predicate slot, INSIDE the opening tag.
  await textarea.pressSequentially("flag");
  await expect(textarea).toHaveValue("{{if::flag}}{{/if}}");
});

test("the popup wears the popover token and the overlay z-index", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(list).toHaveCSS("z-index", "40");
});

test("option rows carry tabIndex=-1 (real DOM focus never leaves the textarea — roving via aria-activedescendant only)", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const tabIndexes = await options.evaluateAll((els) => els.map((el) => el.getAttribute("tabindex")));
  expect(tabIndexes.length).toBeGreaterThan(0);
  expect(tabIndexes.every((value) => value === "-1")).toBe(true);
  // Focus never left the textarea despite the popover being open.
  await expect(textarea).toBeFocused();
});

test("inside a <Field>, the label associates with the textarea with NO explicit id passed (Field.Control registration)", async ({ mount, page }) => {
  await mount(<FieldWrappedStory />);
  const control = page.getByLabel("Body");
  // NATIVE textbox — no `role` attribute at all (F-3). A `role=combobox` here would override the
  // implicit `textbox` and take `aria-multiline` with it, on a field that is explicitly multi-row.
  await expect(control).not.toHaveAttribute("role", ANY_VALUE);
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED suggestions array (the real consumer shape)", async ({ mount, page }) => {
  const cmp = await mount(<DerivedSuggestionsStory />);
  const rerender = cmp.getByTestId("rerender");
  await rerender.click();
  await rerender.click();
  const textarea = page.getByRole("textbox");
  await textarea.click();
  await textarea.pressSequentially("{{cha");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  await expect(page.getByRole("option", { name: "{{user}}" })).toHaveCount(0);
});

// ── side-eye F-3 (2026-08-03): a multiline TEXTBOX that owns a listbox, never a combobox ───────────────
test("the field is a native multiline textbox whose name is its LABEL, closed AND open", async ({ mount, page }) => {
  await mount(<FieldWrappedStory />);
  const control = page.getByRole("textbox", { name: "Body" });
  // CLOSED: no combobox role, no popup claim, and the accessible name is the label — not the value.
  await expect(control).not.toHaveAttribute("role", ANY_VALUE);
  await expect(control).not.toHaveAttribute("aria-expanded", ANY_VALUE);
  await expect(control).not.toHaveAttribute("aria-haspopup", ANY_VALUE);
  await expect(control).toHaveAccessibleName("Body");

  // OPEN: the popup is exposed by RELATIONSHIP (aria-controls + activedescendant), the name is unchanged,
  // and a polite status line announces that completions appeared at all.
  await control.click();
  await control.pressSequentially("{{cha");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  await expect(control).toHaveAccessibleName("Body");
  await expect(control).toHaveAttribute("aria-controls", NON_EMPTY);
  await expect(control).toHaveAttribute("aria-activedescendant", NON_EMPTY);
  await expect(control).not.toHaveAttribute("role", ANY_VALUE);
  await expect(page.locator('[data-slot="macro-textarea-status"]')).toHaveText(SUGGESTION_STATUS_RE);
});

test("a 60-word ghost default never becomes the field's accessible name", async ({ mount, page }) => {
  // The exact defect shape: the accname algorithm's combobox arm fell through to the VALUE, so a template
  // editor announced its entire 60-word template as the field's own name, twice.
  await mount(<GhostDefaultStory />);
  const control = page.getByRole("textbox", { name: "Template" });
  await expect(control).toHaveAccessibleName("Template");
  const name = await control.evaluate((el) => (el as HTMLTextAreaElement).labels?.[0]?.textContent ?? "");
  expect(name).not.toContain("Forget all other previous instructions");
});
