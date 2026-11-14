// @subject packages/ui/src/primitives/compare-blocks/compare-blocks.tsx
// A compare block's state chip wraps its words inside the block at a phone's enlarged text, so the results pane around it does not scroll
// sideways and the chip stays whole inside its block.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { UndecidedReviewPaneStory } from "./_state-label-stories.tsx";

const STORY = "tests/ui/primitives/compare-blocks/_state-label-stories/UndecidedReviewPaneStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SCALES = [2, 3] as const;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const factor of SCALES) {
  test(`the state chip wraps inside its block and the pane holds still at ${factor * 100}% text`, async ({ mount, page }) => {
    const component = await mount<typeof UndecidedReviewPaneStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    const pane = component.locator('[data-probe="pane"]');
    const block = pane.locator('[data-slot="compare-block"]');
    const chip = block.locator('[data-slot="compare-block-state"]');
    await expect(chip).toBeVisible();
    await expect.poll(async () => pane.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(SUBPIXEL);
    const [blockBox, chipBox, clip] = await Promise.all([
      block.boundingBox(),
      chip.boundingBox(),
      chip.evaluate((node) => ({ textWidth: node.scrollWidth, boxWidth: node.clientWidth })),
    ]);
    if (blockBox === null || chipBox === null) {
      throw new Error("The block and its state chip must paint");
    }
    expect(clip.textWidth, "the chip's words are not clipped").toBeLessThanOrEqual(clip.boxWidth + SUBPIXEL);
    expect(chipBox.x, "the chip starts inside the block").toBeGreaterThanOrEqual(blockBox.x - SUBPIXEL);
    expect(chipBox.x + chipBox.width, "the chip ends inside the block").toBeLessThanOrEqual(blockBox.x + blockBox.width + SUBPIXEL);
  });
}
