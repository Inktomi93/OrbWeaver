// ADR 0200: Tailwind inlines the `--shadow-overlay` recipe into `.shadow-overlay`, so the ingredient colours must be
// served variables for a `[data-theme]` to reach a utility-shadowed surface.
import { expect, test } from "@playwright/test";
import type { ElevationStory } from "./_elevation-stories.tsx";

const STORY = "tests/ui/primitives/card/_elevation-stories/ElevationStory";

test("a utility shadow resolves its ingredient colours per theme, exactly as the served recipe does", async ({ mount, page }) => {
  const component = await mount<typeof ElevationStory>(STORY, {});
  const card = component.locator('[data-slot="card-root"]');
  const probe = component.getByText("Recipe probe", { exact: true });
  const read = (): Promise<[string, string]> =>
    Promise.all([card.evaluate((element) => getComputedStyle(element).boxShadow), probe.evaluate((element) => getComputedStyle(element).boxShadow)]);
  // The utility composes Tailwind's ring and inset placeholders ahead of the recipe, so the recipe is the suffix.
  const dark = await read();
  expect(dark[1]).not.toBe("none");
  expect(dark[0].endsWith(dark[1])).toBe(true);

  await page.evaluate(() => {
    document.documentElement.dataset["theme"] = "light";
  });
  await expect.poll(async () => (await read())[1]).not.toBe(dark[1]);
  const light = await read();
  expect(light[0].endsWith(light[1])).toBe(true);
});
