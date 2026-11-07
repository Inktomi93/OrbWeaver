// A value cluster that sits under a slider ends where the slider's rail ends once the knob grid folds, and keeps the row's edge above that step.
import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SliderRailEndStory } from "./_rail-end-stories.tsx";

const STORY = "tests/ui/primitives/slider/_rail-end-stories/SliderRailEndStory";

const rightOf = (locator: Locator): Promise<number> => locator.evaluate((element) => element.getBoundingClientRect().right);

test("below the fold step the cluster ends on the rail, with the reset inboard of the value", async ({ mount }) => {
  const component = await mount<typeof SliderRailEndStory>(STORY);
  const controls = component.locator('[data-slot="slider-control"]');
  const end = component.locator('[data-probe="folded-end"]');
  expect(await rightOf(end)).toBeCloseTo(await rightOf(controls.nth(0)), 0);
  // The DOM order stays value then reset; the paint puts the value at the end.
  expect(await rightOf(component.locator('[data-probe="folded-value"]'))).toBeGreaterThan(await rightOf(component.locator('[data-probe="folded-reset"]')));
});

test("above the fold step the cluster keeps the row's edge, half a thumb past the rail", async ({ mount, page }) => {
  const component = await mount<typeof SliderRailEndStory>(STORY);
  const inset = await resolvedLength(page, `var(${TOKENS["size.slider-inset"].cssVar})`, page.locator("body"));
  expect(inset).toBeGreaterThan(0);
  const controls = component.locator('[data-slot="slider-control"]');
  const end = component.locator('[data-probe="wide-end"]');
  expect((await rightOf(end)) - (await rightOf(controls.nth(1)))).toBeCloseTo(inset, 0);
  expect(await rightOf(component.locator('[data-probe="wide-value"]'))).toBeLessThan(await rightOf(component.locator('[data-probe="wide-reset"]')));
});
