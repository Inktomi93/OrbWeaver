import { expect, test } from "@playwright/test";
import type { TabsIndicatorStory } from "./_indicator-stories.tsx";

const STORY = "tests/ui/primitives/tabs/_indicator-stories/TabsIndicatorStory";
const INDICATOR = '[data-slot="tabs-indicator"]';
const LANDING_TOLERANCE_PX = 0.5;

test("the indicator rests on a transform-only transition", async ({ mount, page }) => {
  await mount<typeof TabsIndicatorStory>(STORY);
  const indicator = page.locator(INDICATOR);
  await expect(indicator).toBeVisible();
  // An unpolled read: a retrying matcher would wait out the glide and pass.
  expect(await indicator.evaluate((node) => getComputedStyle(node).transitionProperty)).toBe("transform");
  expect(await indicator.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
});

test("a tab switch launches a transform transition and lands on the new tab's box", async ({ mount, page }) => {
  await mount<typeof TabsIndicatorStory>(STORY);
  const indicator = page.locator(INDICATOR);
  const longTab = page.getByRole("tab", { name: "A much longer tab", exact: true });
  await expect(indicator).toBeVisible();
  const launched = await longTab.evaluate(async (node) => {
    const strip = document.querySelector('[data-slot="tabs-indicator"]');
    if (node instanceof HTMLElement) {
      node.click();
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return (strip?.getAnimations() ?? []).flatMap((animation) => (animation instanceof CSSTransition ? [animation.transitionProperty] : []));
  });
  expect(launched).toEqual(["transform"]);
  await expect.poll(() => indicator.evaluate((node) => node.getAnimations().length)).toBe(0);
  const tabBox = await longTab.boundingBox();
  const barBox = await indicator.boundingBox();
  expect(Math.abs((barBox?.x ?? Number.NaN) - (tabBox?.x ?? Number.NaN))).toBeLessThan(LANDING_TOLERANCE_PX);
  expect(Math.abs((barBox?.width ?? Number.NaN) - (tabBox?.width ?? Number.NaN))).toBeLessThan(LANDING_TOLERANCE_PX);
});
