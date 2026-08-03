// CT: the user-macro plane reaches the COMPLETION of every prompt-text field in the preset editor. This is
// a property of the composition — `PresetMacroSuggestions` subscribes to the form's `userMacros` and hands
// the composed catalog down — and it was the gap this pair closed: a preset could declare `{{sceneTone}}`
// on the Macros tab and then complete against a popover that had never heard of it, on the very fields
// where it is meant to be called.
//
// Each arm drives the REAL surface through the autosave boundary and asserts the popover ROW (the user's
// affordance), never the catalog object.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { SectionBodyCompletionStory, TemplateCompletionStory, UserMacroBodyCompletionStory } from "./_macro-completion-stories.tsx";

const USER_MACRO_ROW = "{{sceneTone}}";
/** The gloss the popover shows for the user plane — proves the row came from the DEFINITION, not a name. */
const USER_MACRO_GLOSS = "This game's tonal register.";

/** Types a macro trigger into a settled field and returns the popover it opens. */
async function completeIn(page: Page, field: Locator, typed: string): Promise<Locator> {
  await expect(field).toBeVisible();
  await field.click();
  await field.pressSequentially(typed);
  return page.getByRole("listbox");
}

test("a preset's own macro completes in a SECTION BODY", async ({ mount, page }) => {
  const probe = await mount(<SectionBodyCompletionStory />);
  await probe.getByRole("button", { name: "Edit Alpha" }).click();
  const body = probe.getByRole("textbox", { name: "Text" });
  await completeIn(page, body, "{{scen");
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toBeVisible();
  await expect(page.getByText(USER_MACRO_GLOSS)).toBeVisible();
  // …and picking it inserts the call, which is what makes the row worth showing. The row is CLICKED
  // rather than Enter'd: with a `scen` query the fuzzy top hit is the builtin `{{scenario}}`, so Enter
  // would assert the highlight's position, not this row's insertion.
  await page.getByRole("option", { name: USER_MACRO_ROW }).click();
  await expect(body).toHaveValue("{{sceneTone}}");
});

test("a preset's own macro completes in a GUIDED TEMPLATE", async ({ mount, page }) => {
  const probe = await mount(<TemplateCompletionStory />);
  await probe.getByRole("button", { name: "Edit Impersonate", exact: true }).click();
  const template = probe.getByRole("textbox", { name: "Template" });
  await completeIn(page, template, "{{scen");
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toBeVisible();
});

test("a preset's own macro completes in ANOTHER macro's body (the editor offers its own plane)", async ({ mount, page }) => {
  const probe = await mount(<UserMacroBodyCompletionStory />);
  // The ListRow title is the edit affordance; the dialog portals to document.body, so it is `page`-scoped.
  await probe.getByText(USER_MACRO_ROW).click();
  const body = page.getByRole("textbox", { name: "Template" });
  await completeIn(page, body, "{{scen");
  await expect(page.getByRole("option", { name: USER_MACRO_ROW })).toBeVisible();
});

test("the BLOCK forms are offered on a real field, and land as a whole pair", async ({ mount, page }) => {
  const probe = await mount(<SectionBodyCompletionStory />);
  await probe.getByRole("button", { name: "Edit Alpha" }).click();
  const body = probe.getByRole("textbox", { name: "Text" });
  await completeIn(page, body, "{{if");
  await expect(page.getByRole("option", { name: "{{if}}" })).toBeVisible();
  await page.getByRole("option", { name: "{{if}}" }).click();
  await expect(body).toHaveValue("{{if::}}{{/if}}");
});
