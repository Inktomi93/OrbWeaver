import { expect, test } from "@orb/testkit/ct-corpus";
import type { RemovableRowsStory } from "./_library-list-rows-focus-stories.tsx";

const STORY = "tests/client/components/_library-list-rows-focus-stories/RemovableRowsStory";

test("confirming a row delete hands focus to the row now in its place, then the one before it", async ({ page, mount }) => {
  await mount<typeof RemovableRowsStory>(STORY, { ids: ["a", "b", "c"] });
  await page.getByRole("button", { name: "Drop b", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Drop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Drop b", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drop c", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Drop c", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Drop", exact: true }).click();
  await expect(page.getByRole("button", { name: "Drop a", exact: true })).toBeFocused();
});
