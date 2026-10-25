// @subject packages/client/src/components/skip-to-first-row.tsx
import { expect, test } from "@playwright/test";
import type { SkipToFirstRowStory } from "./_skip-to-first-row-stories.tsx";

test("the skip link is the first tab stop, hidden until focused, and lands on the first row past the chrome", async ({ mount, page }) => {
  await mount<typeof SkipToFirstRowStory>("tests/client/components/_skip-to-first-row-stories/SkipToFirstRowStory");
  const skip = page.getByRole("button", { name: "Skip to rows", exact: true });
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "First row", exact: true })).toBeFocused();
});
