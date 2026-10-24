// @subject packages/client/src/components/row-toggle-action.tsx
import { expect, test } from "@playwright/test";
import type { RowToggleActionStory } from "./_row-toggle-action-stories.tsx";

test("a row toggle keeps one accessible name while aria-pressed flips", async ({ mount }) => {
  const component = await mount<typeof RowToggleActionStory>("tests/client/components/_row-toggle-action-stories/RowToggleActionStory", {
    label: "Star The Crimson Court",
  });
  const toggle = component.getByRole("button", { name: "Star The Crimson Court", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(component.getByRole("button", { name: "Star The Crimson Court", exact: true })).toHaveCount(1);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
