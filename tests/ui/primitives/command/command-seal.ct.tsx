import { expect, test } from "@playwright/test";
import type { CommandCenterRowStory, CommandInputRefStory } from "./_command-seal-stories.tsx";

const STORIES = "tests/ui/primitives/command/_command-seal-stories";

test("a ref passed to the search input reaches the real input and leaves the seal's own aria-expanded correction in force", async ({ mount, page }) => {
  await mount<typeof CommandInputRefStory>(`${STORIES}/CommandInputRefStory`);
  const input = page.getByRole("combobox");
  // cmdk hardcodes a literal `true`; the seal corrects it from its own handle on the node, which a caller ref must not displace.
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Focus through the ref", exact: true }).click();
  await expect(input).toBeFocused();
});

test("centerInList puts the row at the centre of its own list and leaves the pane around the list where it was", async ({ mount, page }) => {
  await mount<typeof CommandCenterRowStory>(`${STORIES}/CommandCenterRowStory`);
  const list = page.locator('[data-slot="command-list"]');
  const row = page.getByRole("option", { name: "Row 40", exact: true });
  await expect
    .poll(async () => {
      const [listBox, rowBox] = await Promise.all([list.boundingBox(), row.boundingBox()]);
      if (listBox === null || rowBox === null) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(rowBox.y + rowBox.height / 2 - (listBox.y + listBox.height / 2));
    })
    .toBeLessThan(2);
  expect(await page.locator('[data-slot="outer-pane"]').evaluate((pane) => pane.scrollTop)).toBe(0);
});
