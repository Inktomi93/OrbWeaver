import { expect, test } from "@playwright/test";
import type { DrawerDepthStory, DrawerHandleStory } from "./_native-parts-stories.tsx";

test("the closed edge target occupies the bottom edge and provider depth follows open and close", async ({ mount, page }) => {
  await mount<typeof DrawerDepthStory>("tests/ui/primitives/drawer/_native-parts-stories/DrawerDepthStory");
  const popup = page.getByRole("dialog", { name: "Filters", exact: true });
  const edge = page.locator('[data-slot="drawer-swipe-area"]');
  const indent = page.locator('[data-slot="drawer-indent"]');
  const background = page.locator('[data-slot="drawer-indent-background"]');
  await expect(popup).toBeHidden();
  await expect(edge).toBeVisible();
  await expect
    .poll(() =>
      edge.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          Math.abs(box.bottom - innerHeight) <= 1 &&
          document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === element
        );
      }),
    )
    .toBe(true);
  await expect(indent).not.toHaveAttribute("data-active");
  await expect(background).not.toHaveAttribute("data-active");
  await page.getByRole("button", { name: "Open filters", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAccessibleDescription("Narrow the list.");
  await expect(indent).toHaveAttribute("data-active");
  await expect(background).toHaveAttribute("data-active");
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(popup).toBeHidden();
  await expect(indent).not.toHaveAttribute("data-active");
  await expect(background).not.toHaveAttribute("data-active");
  await expect(edge).toBeVisible();
});

test("drawer handles distinguish imperative payloads from each detached trigger", async ({ mount, page }) => {
  await mount<typeof DrawerHandleStory>("tests/ui/primitives/drawer/_native-parts-stories/DrawerHandleStory");
  const popup = page.getByRole("dialog", { name: "Filter selection", exact: true });
  await expect(popup).toBeHidden();
  for (const [source, description] of [
    ["Open remotely", "Remote filters"],
    ["Characters", "Character filters"],
    ["Rooms", "Room filters"],
  ] as const) {
    await page.getByRole("button", { name: source, exact: true }).click();
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAccessibleDescription(description);
    await popup.getByRole("button", { name: "Done", exact: true }).click();
    await expect(popup).toBeHidden();
  }
});
