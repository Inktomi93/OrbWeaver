import { expect, test } from "@playwright/test";
import type { AlertDialogNativePartsStory } from "./_native-parts-stories.tsx";

test("a remote confirmation can cancel, and detached trigger confirmation uses the selected payload", async ({ mount, page }) => {
  await mount<typeof AlertDialogNativePartsStory>("tests/ui/primitives/alert-dialog/_native-parts-stories/AlertDialogNativePartsStory");
  const dialog = page.getByRole("alertdialog", { name: "Delete draft?", exact: true });
  const result = page.getByRole("status", { name: "Confirmed deletion", exact: true });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete remotely", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Remote draft");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const confirm = dialog.getByRole("button", { name: "Confirm deletion", exact: true });
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(result).toHaveText("Nothing deleted");
  const trigger = page.getByRole("button", { name: "Delete selected", exact: true });
  await trigger.click();
  await expect(dialog).toHaveAccessibleDescription("Selected draft");
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(result).toHaveText("Selected draft");
  await expect(trigger).toBeFocused();
});
