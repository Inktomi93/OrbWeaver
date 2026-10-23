import { expect, test } from "@playwright/test";
import type { DialogNativePartsStory } from "./_native-parts-stories.tsx";

test("imperative and detached dialog sources deliver their own accessible description", async ({ mount, page }) => {
  await mount<typeof DialogNativePartsStory>("tests/ui/primitives/dialog/_native-parts-stories/DialogNativePartsStory");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Open remotely", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Remote settings");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toBeHidden();
  const trigger = page.getByRole("button", { name: "Open account", exact: true });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Account settings");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
