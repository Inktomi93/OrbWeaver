// @subject packages/ui/src/primitives/tooltip/tooltip.tsx
// A tooltip opened by keyboard focus closes when focus moves on, whether to a neighbour that has its own tooltip or to a control that has none.
import { expect, test } from "@playwright/test";
import type { TooltipRailStory } from "./_keyboard-focus-stories.tsx";
import { RAIL_FIRST_HINT, RAIL_FIRST_NAME, RAIL_PLAIN_NAME, RAIL_SECOND_HINT, RAIL_SECOND_NAME } from "./keyboard-focus-names.ts";

const STORY = "tests/ui/primitives/tooltip/_keyboard-focus-stories/TooltipRailStory";

test("a tooltip opened by keyboard focus closes when focus moves to another control", async ({ mount, page }) => {
  await mount<typeof TooltipRailStory>(STORY, {});
  const popups = page.locator('[data-slot="tooltip-popup"]');
  const first = popups.filter({ hasText: RAIL_FIRST_HINT });
  const second = popups.filter({ hasText: RAIL_SECOND_HINT });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: RAIL_FIRST_NAME, exact: true })).toBeFocused();
  await expect(first).toBeVisible();

  // Focus moves to a neighbour with its own tooltip: the first closes as the second opens.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: RAIL_SECOND_NAME, exact: true })).toBeFocused();
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);

  // Focus moves to a control with no tooltip: nothing is left open over it.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: RAIL_PLAIN_NAME, exact: true })).toBeFocused();
  await expect(popups).toHaveCount(0);
});
