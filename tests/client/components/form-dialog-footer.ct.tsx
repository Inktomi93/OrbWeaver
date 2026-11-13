// The owned footer: Cancel and the submit, Enter as the submit, a body fresh on every open and focus back on the opener.
import { expect, test } from "@playwright/test";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { FormDialogBodyStateStory, FormDialogDismissalStory } from "./_form-dialog-stories.tsx";

const BODY_STORY = "tests/client/components/_form-dialog-stories/FormDialogBodyStateStory";
const BLOCKED_STORY = "tests/client/components/_form-dialog-stories/FormDialogDismissalStory";

test("a body's state starts fresh on each open, Enter commits and the opener takes focus back", async ({ mount, page }) => {
  const component = await mount<typeof FormDialogBodyStateStory>(BODY_STORY);
  const opener = component.getByRole("button", { name: "Open draft", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Draft form", exact: true });
  const draft = dialog.getByRole("textbox", { name: "Scratch note", exact: true });
  await expect(dialog.getByRole("button", { name: "Keep draft", exact: true })).toBeDisabled();
  await draft.fill("first");
  await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(component.getByRole("status", { name: "Committed note", exact: true })).toHaveText("");

  await opener.click();
  await expect(draft).toHaveValue("");
  await draft.fill("second");
  await draft.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(component.getByRole("status", { name: "Committed note", exact: true })).toHaveText("second");
});

test("Escape leaves the body's dialog, and a reopen is fresh", async ({ mount, page }) => {
  const component = await mount<typeof FormDialogBodyStateStory>(BODY_STORY);
  await component.getByRole("button", { name: "Open draft", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Draft form", exact: true });
  await dialog.getByRole("textbox", { name: "Scratch note", exact: true }).fill("abandoned");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await component.getByRole("button", { name: "Open draft", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Scratch note", exact: true })).toHaveValue("");
});

test("Enter on a blocked submit commits nothing, and Cancel still closes", async ({ mount, page }) => {
  const component = await mount<typeof FormDialogDismissalStory>(BLOCKED_STORY);
  await component.getByRole("button", { name: "Open form", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Incomplete form", exact: true });
  await dialog.getByRole("textbox", { name: "Required value", exact: true }).press("Enter");
  await dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(component.getByRole("status", { name: "Submissions", exact: true })).toHaveText("0");
});
