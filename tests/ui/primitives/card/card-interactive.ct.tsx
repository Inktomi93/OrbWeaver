// An operable Card paints the tone's text-on-tint ink on its pressed tint, and that ink clears its floor in the pixels.
import { AA_NORMAL_RATIO } from "@orb/kit/theme-derivation";
import { pixelContrast } from "@orb/testkit/browser/spec";
import { SEED_THEME_VALUE_SETS, TONES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MID_GREY } from "../../content/theme-scope/contrast-cases.ts";
import type { CardInteractiveStory } from "./_card-interactive-stories.tsx";

const STORY = "tests/ui/primitives/card/_card-interactive-stories/CardInteractiveStory";
const VARIANTS = ["surface", "soft"] as const;
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const { name, ...props } of CASES) {
  test(`${name}: a hovered Card paints its tone's text-on-tint ink on the tint-active fill and clears AA`, async ({ mount, page }) => {
    // Tailwind's `hover:` applies only under `(hover: hover)`; a touch device keeps the card at rest.
    const hovers = await page.evaluate(() => matchMedia("(hover: hover)").matches);
    test.skip(!hovers, "this device does not hover");
    const component = await mount<typeof CardInteractiveStory>(STORY, props);
    for (const tone of TONES) {
      const row = component.locator(`[data-card-tone="${tone}"]`);
      const ink = await style(row.locator('[data-probe="text-on-tint"]'), "color");
      const fill = await style(row.locator('[data-probe="tint-active"]'), "color");
      for (const variant of VARIANTS) {
        const card = row.locator(`[data-case="${variant}"]`);
        await card.scrollIntoViewIfNeeded();
        await card.hover();
        await expect.poll(() => style(card, "color"), `${tone} ${variant} hover ink`).toBe(ink);
        await expect.poll(() => style(card, "background-color"), `${tone} ${variant} hover fill`).toBe(fill);
        const receipt = await pixelContrast(page, card);
        expect(receipt.ratio, `${tone} ${variant} hover: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
        await page.mouse.move(0, 0);
      }
    }
  });

  test(`${name}: a pressed Card paints its tone's text-on-tint ink on the tint-active fill`, async ({ mount, page }) => {
    const component = await mount<typeof CardInteractiveStory>(STORY, props);
    for (const tone of TONES) {
      const row = component.locator(`[data-card-tone="${tone}"]`);
      const ink = await style(row.locator('[data-probe="text-on-tint"]'), "color");
      const fill = await style(row.locator('[data-probe="tint-active"]'), "color");
      for (const variant of VARIANTS) {
        const card = row.locator(`[data-case="${variant}"]`);
        await card.scrollIntoViewIfNeeded();
        await card.hover();
        await page.mouse.down();
        await expect.poll(() => style(card, "color"), `${tone} ${variant} pressed ink`).toBe(ink);
        await expect.poll(() => style(card, "background-color"), `${tone} ${variant} pressed fill`).toBe(fill);
        await page.mouse.up();
        await page.mouse.move(0, 0);
      }
    }
  });
}
