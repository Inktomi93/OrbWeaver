import { expect, test } from "@playwright/test";
import type { PopoverNativePartsStory } from "./_native-parts-stories.tsx";

test("an anchored handle and detached trigger retain their description through viewport composition", async ({ mount, page }) => {
  await mount<typeof PopoverNativePartsStory>("tests/ui/primitives/popover/_native-parts-stories/PopoverNativePartsStory");
  const popup = page.getByRole("dialog", { name: "Details", exact: true });
  const viewport = page.locator('[data-slot="popover-viewport"]');
  await expect(popup).toBeHidden();
  await page.getByRole("button", { name: "Open remotely", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAccessibleDescription("Character details");
  await expect(viewport).toBeVisible();
  await expect(popup.locator('[data-slot="popover-arrow"]')).toBeVisible();
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toBeHidden();
  await expect(viewport).toBeHidden();
  const trigger = page.getByRole("button", { name: "Rooms", exact: true });
  await trigger.click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAccessibleDescription("Room details");
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
});
