// @subject packages/client/src/lib/prompt-macros.ts
// The builtin catalog's ranked hits fall in several categories out of order; the list names each category once,
// and the arrow keys walk the rows in the order they are drawn.
import { expect, test } from "@playwright/test";
import type { BuiltinMacroCompletionStory } from "./_prompt-macro-completion-stories.tsx";

const STORY = "tests/client/lib/_prompt-macro-completion-stories/BuiltinMacroCompletionStory";

test("typing {{c lists each category once and logs no duplicate-key error", async ({ mount, page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  const component = await mount<typeof BuiltinMacroCompletionStory>(STORY);
  const field = component.getByRole("textbox", { name: "Macro field", exact: true });
  await field.pressSequentially("{{c");
  const list = component.getByRole("listbox", { name: "Macro suggestions", exact: true });
  await expect(list).toBeVisible();
  const headers = await list.locator('[data-slot="macro-textarea-group-header"]').allTextContents();
  const rows = await list.getByRole("option").count();
  // The positive control: the catalog really ranks more than one category here, and rows came back.
  expect(headers.length).toBeGreaterThan(1);
  expect(rows).toBeGreaterThan(headers.length);
  expect(new Set(headers).size).toBe(headers.length);
  expect(errors.filter((text) => text.includes("same key"))).toEqual([]);
});

test("ArrowDown walks the options in the order they are drawn", async ({ mount }) => {
  const component = await mount<typeof BuiltinMacroCompletionStory>(STORY);
  const field = component.getByRole("textbox", { name: "Macro field", exact: true });
  await field.pressSequentially("{{c");
  const list = component.getByRole("listbox", { name: "Macro suggestions", exact: true });
  const drawn = await list.getByRole("option").evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(drawn.length).toBeGreaterThan(2);
  await expect(field).toHaveAttribute("aria-activedescendant", drawn[0] ?? "");
  for (const id of drawn.slice(1)) {
    await field.press("ArrowDown");
    await expect(field).toHaveAttribute("aria-activedescendant", id);
  }
});
