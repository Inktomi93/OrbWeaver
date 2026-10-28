import { expect, test } from "@playwright/test";
import type { FormDialogDismissalStory } from "./_form-dialog-stories.tsx";

test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

test("the shared form footer offers Cancel when its primary action is disabled", async ({ mount, page }) => {
  await mount<typeof FormDialogDismissalStory>("tests/client/components/_form-dialog-stories/FormDialogDismissalStory", {});
  const trigger = page.getByRole("button", { name: "Open form", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Incomplete form", exact: true });
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(save).toBeDisabled();
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeInViewport({ ratio: 1 });
  const footer = dialog.locator('[data-slot="dialog-footer"]').filter({ has: page.getByRole("button", { name: "Save", exact: true }) });
  await expect(footer.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1);
  await cancel.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("status", { name: "Submissions", exact: true })).toHaveText("0");
});
