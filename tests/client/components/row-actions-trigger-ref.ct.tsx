// @subject packages/client/src/components/row-actions-menu.tsx
import { expect, test } from "@playwright/test";
import type { RowActionsTriggerRefStory } from "./_row-actions-trigger-ref-stories.tsx";

test("the trigger ref reaches the real ⋯ button, so a caller can hand focus back to it", async ({ mount, page }) => {
  await mount<typeof RowActionsTriggerRefStory>("tests/client/components/_row-actions-trigger-ref-stories/RowActionsTriggerRefStory");
  await page.getByRole("button", { name: "Hand focus back", exact: true }).click();
  await expect(page.getByRole("button", { name: "Actions for The Crimson Court", exact: true })).toBeFocused();
});
