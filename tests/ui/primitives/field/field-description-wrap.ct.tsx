// @subject packages/ui/src/primitives/field/variants.ts
// A Field description with no break point wraps inside its pane at a phone's largest text instead of pushing the pane sideways.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { UnbrokenDescriptionStory } from "./field-description-wrap-stories.tsx";

const STORIES = "tests/ui/primitives/field/field-description-wrap-stories";
const FONT_SCALE_PROPERTY = channelName("fontScale");

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a description with no break point wraps inside its pane at 300% text", async ({ mount, page }) => {
  const component = await mount<typeof UnbrokenDescriptionStory>(`${STORIES}/UnbrokenDescriptionStory`, {});
  await setRootFontScale(page, FONT_SCALE_PROPERTY, 3);
  const pane = component.locator('[data-probe="pane"]');
  await expect(pane.locator('[data-slot="field-description"]')).toBeVisible();
  const reach = await pane.evaluate((node) => {
    const text = node.querySelector('[data-slot="field-description"]');
    if (text === null) {
      throw new Error("The pane holds no description");
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    return { sideways: node.scrollWidth - node.clientWidth, textPastPane: range.getBoundingClientRect().right - node.getBoundingClientRect().right };
  });
  expect(reach.sideways).toBeLessThanOrEqual(SUBPIXEL);
  expect(reach.textPastPane).toBeLessThanOrEqual(SUBPIXEL);
});
