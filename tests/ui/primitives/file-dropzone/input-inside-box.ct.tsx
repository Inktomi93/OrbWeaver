// @subject packages/ui/src/primitives/file-dropzone/file-dropzone.tsx
// The covering file input is the zone's whole operable surface, so its box lies inside the zone's box. At the largest browser text in a
// phone pane the zone wraps and grows, and a box that left it would hide where to drop and what the control is.
import { boxOf, LAYOUT_SUBPIXEL_PX, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { NarrowPaneDropzoneStory } from "./_input-inside-box-stories.tsx";

const STORY = "tests/ui/primitives/file-dropzone/_input-inside-box-stories/NarrowPaneDropzoneStory";
const PANE_WIDTH = 390;
const LARGEST_TEXT_SCALE = 3;
const CASES = [
  { name: "idle", props: { width: PANE_WIDTH } },
  { name: "refused", props: { width: PANE_WIDTH, error: "The story's own refusal, long enough to wrap onto several lines in a narrow pane" } },
] as const;

test.use({ hasTouch: true, isMobile: true, viewport: { width: PANE_WIDTH, height: 844 } });

for (const { name, props } of CASES) {
  test(`the input's box lies inside the ${name} zone's box at the largest text in a phone pane`, async ({ mount, page }) => {
    await using textSize = await setPlatformTextSize(page, LARGEST_TEXT_SCALE);
    const component = await mount<typeof NarrowPaneDropzoneStory>(STORY, props);
    // The control: the page really runs at the enlarged size, so a green read is not the default size's.
    expect(await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(textSize.standardFontPx);
    const zone = component.locator('[data-slot="file-dropzone"]');
    await expect(zone).toBeVisible();
    const [zoneBox, inputBox] = await Promise.all([boxOf(zone), boxOf(zone.locator('[data-slot="file-dropzone-input"]'))]);
    expect(inputBox.width).toBeGreaterThan(0);
    expect(inputBox.height).toBeGreaterThan(0);
    expect(inputBox.x).toBeGreaterThanOrEqual(zoneBox.x - LAYOUT_SUBPIXEL_PX);
    expect(inputBox.y).toBeGreaterThanOrEqual(zoneBox.y - LAYOUT_SUBPIXEL_PX);
    expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(zoneBox.x + zoneBox.width + LAYOUT_SUBPIXEL_PX);
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(zoneBox.y + zoneBox.height + LAYOUT_SUBPIXEL_PX);
  });
}
