import { expect, test } from "@playwright/test";
import type { DialogNativePartsStory } from "./_native-parts-stories.tsx";

test("the dialog transition names opacity and scale", async ({ mount, page }) => {
  await mount<typeof DialogNativePartsStory>("tests/ui/primitives/dialog/_native-parts-stories/DialogNativePartsStory");
  await page.getByRole("button", { name: "Open remotely", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  // An unpolled read: a retrying matcher would wait out the fade and pass.
  expect(await dialog.evaluate((node) => getComputedStyle(node).transitionProperty)).toBe("opacity, scale");
});

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
