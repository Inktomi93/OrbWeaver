import { expect, test } from "@playwright/test";
import type { PickerDialogStory } from "./_dialog-stories.tsx";

test("keeps the heading at the viewport gutter and dismisses with Escape", async ({ mount, page }) => {
  await mount<typeof PickerDialogStory>("tests/client/components/_dialog-stories/PickerDialogStory", {});
  const dialog = page.getByRole("dialog", { name: "Pick an image", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const viewport = element.parentElement;
        return viewport === null ? Number.NaN : Math.abs(element.getBoundingClientRect().y - Number.parseFloat(getComputedStyle(viewport).paddingTop));
      }),
    )
    .toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
