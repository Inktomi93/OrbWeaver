import { expect, test } from "@playwright/test";
import type { ToastTransitionStory } from "./_transition-stories.tsx";

test("the toast transition names opacity, transform and translate", async ({ mount, page }) => {
  await mount<typeof ToastTransitionStory>("tests/ui/primitives/toast/_transition-stories/ToastTransitionStory");
  await page.getByRole("button", { name: "Add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toBeVisible();
  // An unpolled read: a retrying matcher would wait out the fade and pass.
  expect(await toast.evaluate((node) => getComputedStyle(node).transitionProperty)).toBe("opacity, transform, translate");
});

test("toast viewport padding leaves underlying controls operable", async ({ mount, page }) => {
  await mount<typeof ToastTransitionStory>("tests/ui/primitives/toast/_transition-stories/ToastTransitionStory");
  const button = page.getByRole("button", { name: "Add toast", exact: true });
  await button.click();
  const toast = page.locator('[data-slot="toast-root"]').first();
  await expect(toast).toBeVisible();
  await expect.poll(() => toast.evaluate((node) => node.getAnimations().length)).toBe(0);
  const point = await button.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  const viewport = await page.getByRole("region", { name: "Alerts", exact: true }).boundingBox();
  const card = await toast.boundingBox();
  expect(point.x).toBeGreaterThan(viewport?.x ?? Number.NaN);
  expect(point.y).toBeGreaterThan(viewport?.y ?? Number.NaN);
  expect(point.y).toBeLessThan(card?.y ?? Number.NaN);
  await expect
    .poll(() =>
      button.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }),
    )
    .toBe(true);
  await button.click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);
});
