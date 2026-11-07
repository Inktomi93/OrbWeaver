import { expect, test } from "@playwright/test";
import type { ViewerDialogStory } from "./_dialog-stories.tsx";

test("names the viewer, traps keyboard focus and dismisses through the native close", async ({ mount, page }) => {
  await mount<typeof ViewerDialogStory>("tests/client/components/_dialog-stories/ViewerDialogStory", {});
  const dialog = page.getByRole("dialog", { name: "Recorded content", exact: true });
  await expect(dialog).toBeVisible();
  const controls = dialog.getByRole("button");
  expect(await controls.count()).toBeGreaterThan(1);
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});
