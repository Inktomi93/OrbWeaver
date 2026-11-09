// A list that fills the whole port of the region around it hands a wheel at its end to that region, so what lies past the list stays reachable.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { InnerListChainStory } from "./_inner-list-chain-stories.tsx";

const STORY = "tests/client/components/_inner-list-chain-stories/InnerListChainStory";
const WHEEL_STEP_PX = 120;
// The lists a pane gives its whole port, by the slot each paints.
const LISTS = [
  { list: "library", slot: "library-list-scroll" },
  { list: "virtual", slot: "virtual-list-scroll" },
] as const;

const scrollTopOf = (region: Locator): Promise<number> => region.evaluate((node) => node.scrollTop);

for (const { list, slot } of LISTS) {
  test(`a wheel at the end of the ${list} list scrolls the region around it`, async ({ mount, page }) => {
    await mount<typeof InnerListChainStory>(STORY, { list });
    const inner = page.locator(`[data-slot="${slot}"]`);
    const outer = page.locator('[data-region="outer"]');
    await expect(inner).toBeVisible();
    const box = await outer.boundingBox();
    if (box === null) {
      throw new Error("The region has no geometry");
    }
    // The foot of the region's port lies inside the list, which covers the whole port below the band.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8);
    // Control: while the list has rows left below, the wheel moves the list and leaves the region where it was.
    await page.mouse.wheel(0, WHEEL_STEP_PX);
    await expect.poll(() => scrollTopOf(inner)).toBeGreaterThan(0);
    expect(await scrollTopOf(outer)).toBe(0);
    await inner.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.mouse.wheel(0, WHEEL_STEP_PX);
    await expect.poll(() => scrollTopOf(outer)).toBeGreaterThan(0);
  });
}
