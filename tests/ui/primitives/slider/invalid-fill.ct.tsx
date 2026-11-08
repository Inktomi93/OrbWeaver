// A slider's fill is the primary colour, and an invalid Field swaps it for the destructive colour at full strength.

import { computedStyle } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { SliderInvalidFillStory } from "./_invalid-fill-stories.tsx";

const STORY = "tests/ui/primitives/slider/_invalid-fill-stories/SliderInvalidFillStory";

test("an invalid fill is the destructive colour at full strength, and a valid one stays the primary colour", async ({ mount }) => {
  const component = await mount<typeof SliderInvalidFillStory>(STORY);
  const fills = component.locator('[data-slot="slider-indicator"]');
  await expect(fills).toHaveCount(2);
  const valid = fills.nth(0);
  const invalid = fills.nth(1);
  await expect(invalid).toHaveAttribute("data-invalid", "");
  expect(await computedStyle(valid, "background-color"), "a valid fill").toBe(
    await computedStyle(component.locator('[data-probe="primary"]'), "background-color"),
  );
  expect(await computedStyle(invalid, "opacity"), "an invalid fill").toBe("1");
  expect(await computedStyle(invalid, "background-color")).toBe(await computedStyle(component.locator('[data-probe="destructive"]'), "background-color"));
});
