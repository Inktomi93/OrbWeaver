// @subject packages/ui/src/primitives/collapsible/variants.ts
// A disclosure trigger's label wraps between words at the phone's enlarged text, so the trigger stays inside its pane and the pane does not scroll sideways.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { TriggerLabelStory } from "./_trigger-label-stories.tsx";

const STORY = "tests/ui/primitives/collapsible/_trigger-label-stories/TriggerLabelStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const SCALES = [2, 3] as const;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const factor of SCALES) {
  test(`a long trigger label wraps inside a phone pane at ${factor * 100}% text`, async ({ mount, page }) => {
    const component = await mount<typeof TriggerLabelStory>(STORY, {});
    await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
    const pane = component.locator('[data-probe="pane"]');
    const trigger = component.getByRole("button");
    // The trigger's height in lines of its own line height: a label that wrapped fills two or more.
    const lines = (): Promise<number> => trigger.evaluate((node) => node.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(node).lineHeight));
    await expect.poll(lines).toBeGreaterThanOrEqual(2);
    const [within, box] = await Promise.all([pane.boundingBox(), trigger.boundingBox()]);
    expect(within).not.toBeNull();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual((within?.x ?? 0) - SUBPIXEL);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((within?.x ?? 0) + (within?.width ?? 0) + SUBPIXEL);
    const sideways = await pane.evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(sideways).toBeLessThanOrEqual(SUBPIXEL);
  });
}
