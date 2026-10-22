import { expect, test } from "@playwright/test";
import type { FlowDialogStory } from "./_dialog-stories.tsx";

test("scrolls a tall stage below its pinned heading and keeps its action visible", async ({ mount, page }) => {
  await page.setViewportSize({ width: 430, height: 740 });
  await mount<typeof FlowDialogStory>("tests/client/components/_dialog-stories/FlowDialogStory", {});
  const dialog = page.getByRole("dialog", { name: "Join a room", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Join a room", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeInViewport({ ratio: 1 });
});
