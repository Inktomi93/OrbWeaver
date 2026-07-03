// CT: the macro-textarea seal — a hand-rolled combobox on a native textarea. Typing `{{` opens a
// fuzzy-filtered popover of macro suggestions; ArrowUp/Down + Enter/Tab insert with cursor
// reposition; Esc closes leaving value + focus alone; an empty suggestion set never opens a
// popover. Real keystrokes via pressSequentially/press so the trigger-detection logic (wired off
// the real DOM `selectionStart`) fires exactly as it would for a user.
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import {
  DerivedSuggestionsStory,
  EmptySuggestionsStory,
  FieldWrappedStory,
  MacroTextareaStory,
} from "./macro-textarea.fixtures";

const NON_EMPTY = /.+/u;

test("typing `{{` opens a filtered popover", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{cha");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  await expect(page.getByRole("option", { name: "{{user}}" })).toHaveCount(0);
});

test("controlled value/onChange: plain typing with no trigger round-trips through the parent", async ({
  mount,
  page,
}) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("hello world");
  await expect(textarea).toHaveValue("hello world");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("ArrowDown moves the highlight, Enter inserts and repositions the caret at the end", async ({
  mount,
  page,
}) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
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
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{ti");
  await expect(page.getByRole("option", { name: "{{time}}" })).toBeVisible();
  await textarea.press("Tab");
  await expect(textarea).toHaveValue("{{time}}");
});

test("Escape closes the popover, leaving value and focus untouched", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
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
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{anything");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("adjacent same-category suggestions group under ONE header", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  // char + user are adjacent "Character" entries — ONE header, not two.
  await expect(page.getByText("Character", { exact: true })).toHaveCount(1);
  await expect(page.getByText("System", { exact: true })).toBeVisible();
  await expect(page.getByText("Variables", { exact: true })).toBeVisible();
});

test("a parameterized macro inserts the `::` template and shows the arg hint", async ({
  mount,
  page,
}) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
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

test("the popup wears the popover token and the overlay z-index", async ({ mount, page }) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS("background-color", TOKENS["color.popover"].value);
  await expect(list).toHaveCSS("z-index", "40");
});

test("option rows carry tabIndex=-1 (real DOM focus never leaves the textarea — roving via aria-activedescendant only)", async ({
  mount,
  page,
}) => {
  await mount(<MacroTextareaStory />);
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{");
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const tabIndexes = await options.evaluateAll((els) =>
    els.map((el) => el.getAttribute("tabindex")),
  );
  expect(tabIndexes.length).toBeGreaterThan(0);
  expect(tabIndexes.every((value) => value === "-1")).toBe(true);
  // Focus never left the textarea despite the popover being open.
  await expect(textarea).toBeFocused();
});

test("inside a <Field>, the label associates with the textarea with NO explicit id passed (Field.Control registration)", async ({
  mount,
  page,
}) => {
  await mount(<FieldWrappedStory />);
  const control = page.getByLabel("Body");
  await expect(control).toHaveAttribute("role", "combobox");
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED suggestions array (the real consumer shape)", async ({
  mount,
  page,
}) => {
  const cmp = await mount(<DerivedSuggestionsStory />);
  const rerender = cmp.getByTestId("rerender");
  await rerender.click();
  await rerender.click();
  const textarea = page.getByRole("combobox");
  await textarea.click();
  await textarea.pressSequentially("{{cha");
  await expect(page.getByRole("option", { name: "{{char}}" })).toBeVisible();
  await expect(page.getByRole("option", { name: "{{user}}" })).toHaveCount(0);
});
