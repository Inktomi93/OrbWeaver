// The control asks first: Cancel acts on nothing and returns focus, and a refused verb keeps the confirm open as its retry.
import { expect, test } from "@playwright/test";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { DestructiveActionRetryStory } from "./_destructive-action-stories.tsx";

const STORY = "tests/client/components/_destructive-action-stories/DestructiveActionRetryStory";

test("Cancel and Escape act on nothing and hand focus back to the control", async ({ mount, page }) => {
  const component = await mount<typeof DestructiveActionRetryStory>(STORY);
  const control = component.getByRole("button", { name: "Erase", exact: true });
  const confirm = page.getByRole("alertdialog", { name: "Erase this row?", exact: true });
  await control.click();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(control).toBeFocused();
  await control.click();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(control).toBeFocused();
  await expect(component.getByRole("status", { name: "Press count", exact: true })).toHaveText("0");
});

test("a refused verb holds the confirm open with its reason, and the same button retries", async ({ mount, page }) => {
  const component = await mount<typeof DestructiveActionRetryStory>(STORY);
  await component.getByRole("button", { name: "Erase", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Erase this row?", exact: true });
  const verb = confirm.getByRole("button", { name: "Erase row", exact: true });
  await verb.click();
  await expect(confirm.getByRole("alert")).toContainText("the row is locked");
  await verb.click();
  await expect(confirm).toHaveCount(0);
  await expect(component.getByRole("status", { name: "Press count", exact: true })).toHaveText("2");
});
