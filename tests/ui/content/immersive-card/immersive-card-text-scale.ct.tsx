// The user's appearance font scale reaches the isolated card document: rem-sized card text follows it, and
// authored px text stays the author's fixed size. The scale is written the way the client writes it, onto the root.
// The px line is the unscaled reference, so the expectation is derived from the frame itself, not a restated 16.
import { FONT_SCALE } from "@orb/kit/font-scale";
import { channelName } from "@orb/testkit/ct";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ImmersiveCardTextScaleStory } from "./_card-stories.tsx";

const STORY = "tests/ui/content/immersive-card/_card-stories/ImmersiveCardTextScaleStory";
const FRAME = '[data-slot="sandbox-frame"]';
// The registered property the appearance writer sets for the font-scale setting, read from the manifest.
const FONT_SCALE_PROPERTY = channelName("fontScale");
const { min: MIN_SCALE, max: MAX_SCALE } = FONT_SCALE;
// Each written scale and the scale the frame renders: the legal range passes through, and a scale outside it stops at the bound.
const SCALES = [
  [MIN_SCALE, MIN_SCALE],
  [1, 1],
  [MAX_SCALE, MAX_SCALE],
  [3, MAX_SCALE],
] as const;

const sizeOf = async (page: Page, selector: string): Promise<number> =>
  Number.parseFloat(
    await page
      .frameLocator(FRAME)
      .locator(selector)
      .evaluate((node) => getComputedStyle(node).fontSize),
  );

for (const [scale, rendered] of SCALES) {
  test(`card text sized in rem renders at scale ${rendered} for the font scale ${scale}; authored px text stays fixed`, async ({ mount, page }) => {
    await mount<typeof ImmersiveCardTextScaleStory>(STORY, {});
    const fixed = await sizeOf(page, "#px");
    await page.evaluate(([property, value]) => document.documentElement.style.setProperty(property, value), [FONT_SCALE_PROPERTY, String(scale)] as const);
    await expect.poll(() => sizeOf(page, "#rem")).toBe(fixed * rendered);
    expect(await sizeOf(page, "#px")).toBe(fixed);
  });
}
