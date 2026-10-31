// D144(b): the context-boundary divider's label sits on the derived reading plate over a room's art, and on nothing in a
// plain room. The ink on it clears AA against the plate's painted pixels whichever extreme the photo puts behind it.
import { AA_NORMAL_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ContextDividerStory } from "./_context-divider-stories.tsx";

const STORY = "tests/client/features/chat/components/_context-divider-stories/ContextDividerStory";
const LABEL = /^In context from here/u;
const THEMES = [undefined, ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[])] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const theme of THEMES) {
  test.describe(`${theme ?? "hearth"} seed`, () => {
    const props = theme === undefined ? {} : { theme };

    test("a plain room's label paints no plate", async ({ mount }) => {
      const root = await mount<typeof ContextDividerStory>(STORY, props);
      const label = root.getByText(LABEL).locator("xpath=..");
      await expect(label).toBeVisible();
      expect(await style(label, "background-color")).toBe(await style(root.locator('[data-probe="transparent"]'), "background-color"));
    });

    for (const art of ["light", "dark"] as const) {
      test(`the label over ${art} art paints the reading plate and its ink, and the ink clears AA on the painted plate`, async ({ mount, page }) => {
        const root = await mount<typeof ContextDividerStory>(STORY, { ...props, art });
        const text = root.getByText(LABEL);
        const label = text.locator("xpath=..");
        await expect(text).toBeVisible();
        expect(await style(label, "background-color")).toBe(await style(root.locator('[data-probe="reading-plate"]'), "background-color"));
        const plate = await pixelSurface(page, label, { region: { x0: 0.02, x1: 0.1, y0: 0.1, y1: 0.9 } });
        const { ink } = await pixelContrast(page, text);
        expect(wcagContrastRatio(ink, plate.rgb), `${JSON.stringify(ink)} on ${plate.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      });
    }
  });
}
