// A tab list with more tabs than its pane holds, at the largest browser text on a phone, stays inside the pane and scrolls in its own box:
// the pane does not scroll sideways, the selected tab is shown in the list, and the box that clips the block axis leaves the focus ring its room.
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, resolvedLength, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { EnlargedStripStory } from "./_enlarged-strip-stories.tsx";

const STORY = "tests/ui/primitives/tabs/_enlarged-strip-stories/EnlargedStripStory";
const PHONE_WIDTH = 390;

test.use({ hasTouch: true, isMobile: true, viewport: { width: PHONE_WIDTH, height: 844 } });

/** How far `tab` reaches past either inline edge of `box`; at most the subpixel when the tab is shown whole. */
async function reachPast(tab: Locator, box: Locator): Promise<number> {
  const [tabBox, outer] = await Promise.all([tab.boundingBox(), box.boundingBox()]);
  if (tabBox === null || outer === null) {
    throw new Error("The tab and its box must render");
  }
  return Math.max(outer.x - tabBox.x, tabBox.x + tabBox.width - outer.x - outer.width);
}

test("a strip of more tabs than the pane holds stays inside the pane, scrolls in its own box and shows the selected tab", async ({ mount, page }) => {
  await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
  await mount<typeof EnlargedStripStory>(STORY, { width: PHONE_WIDTH, selected: "ledger" });
  const pane = page.getByRole("region", { name: "Pane", exact: true });
  const list = page.getByRole("tablist", { name: "Review stages", exact: true });
  const first = page.getByRole("tab", { name: "Opening", exact: true });
  const last = page.getByRole("tab", { name: "Sign-off ledger", exact: true });
  await expect(last).toHaveAttribute("aria-selected", "true");

  // The control: the tabs outgrow the pane, so the list has something to scroll and the pane something to widen by.
  const tabs = await Promise.all([first.boundingBox(), last.boundingBox()]);
  expect((tabs[1]?.x ?? 0) + (tabs[1]?.width ?? 0) - (tabs[0]?.x ?? 0)).toBeGreaterThan(PHONE_WIDTH);

  const paneExtent = await pane.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
  expect(paneExtent.scroll).toBe(paneExtent.client);
  const [paneBox, listBox] = await Promise.all([pane.boundingBox(), list.boundingBox()]);
  expect((listBox?.x ?? 0) + (listBox?.width ?? 0)).toBeLessThanOrEqual((paneBox?.x ?? 0) + (paneBox?.width ?? 0) + LAYOUT_SUBPIXEL_PX);

  // The selected tab is the one that was scrolled in, so the list moved inside its own box.
  expect(await list.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  await expect.poll(() => list.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => reachPast(last, list)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);

  await first.focus();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => reachPast(first, list)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
  await expect.poll(() => list.evaluate((node) => node.scrollLeft)).toBe(0);
});

test("the strip leaves each tab the room its focus ring paints in, above and below", async ({ mount, page }) => {
  await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
  await mount<typeof EnlargedStripStory>(STORY, { width: PHONE_WIDTH, selected: "opening" });
  const pane = page.getByRole("region", { name: "Pane", exact: true });
  const list = page.getByRole("tablist", { name: "Review stages", exact: true });
  const ring = await resolvedLength(page, `calc(var(${TOKENS["focus-ring.offset"].cssVar}) + var(${TOKENS["border-width.rule"].cssVar}))`, pane);
  expect(ring).toBeGreaterThan(0);
  const room = await list.evaluate((node) => {
    const tab = node.querySelector('[role="tab"]');
    if (tab === null) {
      throw new Error("The strip must render its tabs");
    }
    const tabBox = tab.getBoundingClientRect();
    const clipTop = node.getBoundingClientRect().top + node.clientTop;
    return { above: tabBox.top - clipTop, below: clipTop + node.clientHeight - tabBox.bottom };
  });
  expect(room.above).toBeGreaterThanOrEqual(ring - LAYOUT_SUBPIXEL_PX);
  expect(room.below).toBeGreaterThanOrEqual(ring - LAYOUT_SUBPIXEL_PX);
});
