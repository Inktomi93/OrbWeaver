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
