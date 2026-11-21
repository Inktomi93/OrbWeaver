// A primary button's hover and pressed steps stay visibly stepped, and keep their ink readable, under an accent whose ink sits
// on the end the palette's steps move toward: a navy on a dark page and a pale yellow on a light one (D336, D71).

import { AA_NORMAL_RATIO, oklabDistance, srgbToOklch } from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { AccentButtonStory } from "./_dark-accent-stories.tsx";
import { ACCENT_STEP_CASES } from "./contrast-cases.ts";

const STORY = "tests/ui/content/theme-scope/_dark-accent-stories/AccentButtonStory";

/**
 * The least OKLab distance a step must paint from the fill to read as a change. A shipped accent steps 0.03; a navy that
 * painted its hover at the fill's own pixel stepped under a millionth.
 */
const VISIBLE_STEP = 0.01;

for (const { name, props } of ACCENT_STEP_CASES) {
  test(`${name}: hover and pressed step visibly off the fill and keep AA ink`, async ({ mount, page }) => {
    const component = await mount<typeof AccentButtonStory>(STORY, props);
    const button = component.getByRole("button", { name: "Save", exact: true });
    await expect(button).toBeVisible();
    const rest = srgbToOklch((await pixelSurface(page, button)).rgb);
    await button.hover();
    await expect
      .poll(async () => oklabDistance(rest, srgbToOklch((await pixelSurface(page, button)).rgb)), { message: "hover steps off the fill" })
      .toBeGreaterThanOrEqual(VISIBLE_STEP);
    expect((await pixelContrast(page, button)).ratio, "ink on the hover step").toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    await page.mouse.down();
    await expect
      .poll(async () => oklabDistance(rest, srgbToOklch((await pixelSurface(page, button)).rgb)), { message: "pressed steps off the fill" })
      .toBeGreaterThanOrEqual(VISIBLE_STEP);
    expect((await pixelContrast(page, button)).ratio, "ink on the pressed step").toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    await page.mouse.up();
  });
}
