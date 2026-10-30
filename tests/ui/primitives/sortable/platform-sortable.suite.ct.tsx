// SortableList reorders by keyboard through dnd-kit; the seal's own wiring keeps focus on the handle and speaks row names, never ids.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ReorderableTracksStory } from "./sortable-stories.tsx";

const STORY = "tests/ui/primitives/sortable/sortable-stories/ReorderableTracksStory";

function handleOf(page: Page, name: string): Locator {
  return page.getByRole("listitem").filter({ hasText: name }).locator('[data-slot="sortable-handle"]');
}

const order = (page: Page): Locator => page.getByRole("status", { name: "Current order" });

test("a keyboard drag moves a row several places and leaves focus on its handle", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false });
  const alpha = handleOf(page, "Alpha");
  await alpha.focus();
  await page.keyboard.press("Space");
  // Each arrow must still reach the sensor, which only happens while the handle keeps focus between moves.
  await page.keyboard.press("ArrowDown");
  await expect(alpha).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(alpha).toBeFocused();
  await page.keyboard.press("Space");
  await expect(order(page)).toHaveText("Beta Gamma Alpha Delta");
  await expect(handleOf(page, "Alpha")).toBeFocused();
});

test("a cancelled keyboard drag reports no reorder", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false });
  const alpha = handleOf(page, "Alpha");
  await alpha.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(alpha).toBeFocused();
  await expect(order(page)).toHaveText("Alpha Beta Gamma Delta");
});

test("the live region names the row and its position, never its id", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false });
  const alpha = handleOf(page, "Alpha");
  await alpha.focus();
  await page.keyboard.press("Space");
  const announcements = page.locator("[aria-live]").filter({ hasText: "Alpha" });
  await expect(announcements.first()).toContainText("position 1 of 4");
  await page.keyboard.press("ArrowDown");
  await expect(announcements.first()).toContainText("position 2 of 4");
  await page.keyboard.press("Space");
  await expect(announcements.first()).toContainText("position 2 of 4");
  await expect(announcements.first()).not.toContainText("trk_");
});

test("every row exposes its rank and the list size to assistive technology", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false });
  const rows = page.getByRole("list", { name: "Playlist" }).getByRole("listitem");
  await expect(rows).toHaveCount(4);
  for (const [index, row] of (await rows.all()).entries()) {
    await expect(row).toHaveAttribute("aria-posinset", String(index + 1));
    await expect(row).toHaveAttribute("aria-setsize", "4");
  }
});

test("a disabled list has no operable handle", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: true });
  await expect(handleOf(page, "Alpha")).toBeDisabled();
  await expect(handleOf(page, "Beta")).toBeDisabled();
});
