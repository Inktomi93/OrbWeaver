// @subject packages/ui/src/primitives/number-field/variants.ts
// The inline number cell sits on the control scale, and the stepped field's input and steppers reach the touch floor under a finger.
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { InlineNumberFieldStory } from "./_inline-height-stories.tsx";

const STORY = "tests/ui/primitives/number-field/_inline-height-stories/InlineNumberFieldStory";

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 740 } });

  test("the inline cell is at least the touch-target token tall", async ({ mount, page }) => {
    expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
    const component = await mount<typeof InlineNumberFieldStory>(STORY);
    const input = component.getByRole("textbox", { name: "Temperature", exact: true });
    const token = await component.locator('[data-probe="touch-target"]').evaluate((node) => node.getBoundingClientRect().height);
    const box = await input.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(token - 2);
  });

  test("the stepped field's input and steppers are each the touch-target token tall", async ({ mount }) => {
    const component = await mount<typeof InlineNumberFieldStory>(STORY);
    const token = await component.locator('[data-probe="touch-target"]').evaluate((node) => node.getBoundingClientRect().height);
    const input = await component.getByRole("textbox", { name: "Retries", exact: true }).boundingBox();
    expect(input?.height ?? 0).toBeGreaterThanOrEqual(token);
    for (const name of ["Decrease Retries", "Increase Retries"]) {
      const stepper = await component.getByRole("button", { name, exact: true }).evaluate((node) => {
        const area = getComputedStyle(node, "::before");
        return Math.max(node.getBoundingClientRect().height, Number.parseFloat(area.height) || 0);
      });
      expect(stepper).toBeGreaterThanOrEqual(token);
    }
  });
});
