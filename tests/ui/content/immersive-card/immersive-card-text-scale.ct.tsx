// The user's appearance font scale reaches the isolated card document: rem-sized card text follows it, and
// authored px text stays the author's fixed size. The scale is written the way the client writes it, onto the root.
// The px line is the unscaled reference, so the expectation is derived from the frame itself, not a restated 16.
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ImmersiveCardTextScaleStory } from "./_card-stories.tsx";

const STORY = "tests/ui/content/immersive-card/_card-stories/ImmersiveCardTextScaleStory";
const FRAME = '[data-slot="sandbox-frame"]';
// The registered property the appearance writer sets for the font-scale setting, read from the manifest.
const FONT_SCALE_PROPERTY = APPEARANCE_CHANNEL_ROWS.find((row) => row.key === "fontScale")?.name ?? "";
const SCALES = [1, 1.5, 2, 3] as const;

const sizeOf = async (page: Page, selector: string): Promise<number> =>
  Number.parseFloat(
    await page
      .frameLocator(FRAME)
      .locator(selector)
      .evaluate((node) => getComputedStyle(node).fontSize),
  );

for (const scale of SCALES) {
  test(`card text sized in rem follows the font scale ${scale}; authored px text stays fixed`, async ({ mount, page }) => {
    await mount<typeof ImmersiveCardTextScaleStory>(STORY, {});
    const fixed = await sizeOf(page, "#px");
    await page.evaluate(([property, value]) => document.documentElement.style.setProperty(property, value), [FONT_SCALE_PROPERTY, String(scale)] as const);
    await expect.poll(() => sizeOf(page, "#rem")).toBe(fixed * scale);
    expect(await sizeOf(page, "#px")).toBe(fixed);
  });
}
