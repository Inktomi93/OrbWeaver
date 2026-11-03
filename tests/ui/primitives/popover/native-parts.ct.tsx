import { expect, test } from "@playwright/test";
import type { PopoverNativePartsStory, PopoverStyleStory } from "./_native-parts-stories.tsx";

test("the popover transition names opacity and scale", async ({ mount, page }) => {
  await mount<typeof PopoverNativePartsStory>("tests/ui/primitives/popover/_native-parts-stories/PopoverNativePartsStory");
  await page.getByRole("button", { name: "Open remotely", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Details", exact: true });
  await expect(popup).toBeVisible();
  // An unpolled read: a retrying matcher would wait out the fade and pass.
  expect(await popup.evaluate((node) => getComputedStyle(node).transitionProperty)).toBe("opacity, scale");
});

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

for (const stable of [false, true]) {
  test(`native popup style callbacks survive stable width ${String(stable)}`, async ({ mount, page }) => {
    const root = await mount<typeof PopoverStyleStory>("tests/ui/primitives/popover/_native-parts-stories/PopoverStyleStory", { stable });
    await page.getByRole("button", { name: "Open styled popup", exact: true }).click();
    const popup = page.getByRole("dialog", { name: "Styled popup", exact: true });
    await expect(popup).toHaveCSS("opacity", "0.6");
    expect(await popup.evaluate((node) => node.style.width === "1px")).toBe(!stable);
    await root.update({ stable, callback: false });
    await expect(popup).toHaveCSS("opacity", "0.6");
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
  });
}
