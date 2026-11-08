// The action slot is the parent of the offered action, not a marker that happens to share its markup.
import { expect, test } from "@playwright/test";
import type { ActionSlotStory } from "./_action-slot-stories.tsx";

const STORY = "tests/ui/primitives/empty-state/_action-slot-stories/ActionSlotStory";

test("a null action renders no action slot", async ({ mount }) => {
  const component = await mount<typeof ActionSlotStory>(STORY, { offered: false });
  await expect(component.locator('[data-slot="empty-state-title"]')).toBeVisible();
  await expect(component.locator('[data-slot="empty-state-action"]')).toHaveCount(0);
});

test("a real action renders as a child of the action slot", async ({ mount }) => {
  const component = await mount<typeof ActionSlotStory>(STORY, { offered: true });
  await expect(component.locator('[data-slot="empty-state-action"] > button')).toHaveText("Go");
});
