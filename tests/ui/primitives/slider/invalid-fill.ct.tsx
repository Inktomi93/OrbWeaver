// A neutral slider's fill is a faint foreground bar, and an invalid Field swaps it for the destructive colour at full strength.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SliderInvalidFillStory } from "./_invalid-fill-stories.tsx";

const STORY = "tests/ui/primitives/slider/_invalid-fill-stories/SliderInvalidFillStory";

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test("an invalid neutral fill is the destructive colour at full strength, and a valid one stays faint", async ({ mount }) => {
  const component = await mount<typeof SliderInvalidFillStory>(STORY);
  const fills = component.locator('[data-slot="slider-indicator"]');
  await expect(fills).toHaveCount(2);
  const valid = fills.nth(0);
  const invalid = fills.nth(1);
  await expect(invalid).toHaveAttribute("data-invalid", "");
  expect(Number(await style(valid, "opacity")), "a valid fill is faint").toBeLessThan(1);
  expect(await style(invalid, "opacity"), "an invalid fill").toBe("1");
  expect(await style(invalid, "background-color")).toBe(await style(component.locator('[data-probe="destructive"]'), "background-color"));
});
