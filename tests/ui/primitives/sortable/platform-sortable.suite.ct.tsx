// SortableList reorders by keyboard through dnd-kit; the seal's own wiring keeps focus on the handle and speaks row names, never ids.

import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { sortablePositionName } from "../../../../packages/ui/src/primitives/sortable/sortable-names.ts";
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
  const rows = await page.getByRole("listitem").count();
  expect(rows, "the story mounts more than one row").toBeGreaterThan(1);
  await alpha.focus();
  await page.keyboard.press("Space");
  const announcements = page.locator("[aria-live]").filter({ hasText: "Alpha" });
  const picked = sortablePositionName("Alpha", 1, rows);
  const moved = sortablePositionName("Alpha", 2, rows);
  // The control: the two lines differ only by the rank, so the cases below prove the rank is spoken and moves.
  expect(moved).not.toBe(picked);
  await expect(announcements.first()).toContainText(picked);
  await page.keyboard.press("ArrowDown");
  await expect(announcements.first()).toContainText(moved);
  await expect(announcements.first()).not.toContainText(picked);
  await page.keyboard.press("Space");
  await expect(announcements.first()).toContainText(moved);
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

// The list is the container its rows answer to: under the `cq-16` step the grip stops taking a column and sits above the row.
type Box = NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>;
const STEP = `var(${TOKENS["container.cq-16"].cssVar})`;

async function layoutOf(page: Page): Promise<Record<"grip" | "content" | "item", Box>> {
  const row = page.getByRole("listitem").first();
  const [grip, content, item] = await Promise.all([
    row.locator('[data-slot="sortable-handle"]').boundingBox(),
    row.locator('[data-slot="sortable-content"]').boundingBox(),
    row.boundingBox(),
  ]);
  if (grip === null || content === null || item === null) {
    throw new Error("The first row must paint its grip, content and box");
  }
  return { grip, content, item };
}

test("a list wider than the step seats the grip beside its row", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false, width: `calc(${STEP} + 4rem)` });
  const { grip, content } = await layoutOf(page);
  expect(content.x).toBeGreaterThanOrEqual(grip.x + grip.width);
});

test("a list narrower than the step puts the grip above its row and gives the row the list's whole width", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false, width: `calc(${STEP} - 4rem)` });
  const { grip, content, item } = await layoutOf(page);
  expect(content.y).toBeGreaterThanOrEqual(grip.y + grip.height);
  expect(Math.round(content.width)).toBe(Math.round(item.width));
});

test("a stacked grip and its row read as one pair: the gap inside it is at most half the gap above it", async ({ mount, page }) => {
  await mount<typeof ReorderableTracksStory>(STORY, { disabled: false, width: `calc(${STEP} - 4rem)` });
  const rows = page.getByRole("listitem");
  const [above, grip, content] = await Promise.all([
    rows.first().boundingBox(),
    rows.nth(1).locator('[data-slot="sortable-handle"]').boundingBox(),
    rows.nth(1).locator('[data-slot="sortable-content"]').boundingBox(),
  ]);
  if (above === null || grip === null || content === null) {
    throw new Error("The first two rows must paint");
  }
  // One pair: the gap inside it is at most half the gap above it.
  expect(2 * (content.y - (grip.y + grip.height))).toBeLessThanOrEqual(grip.y - (above.y + above.height));
  expect(grip.x).toBe(content.x);
});
