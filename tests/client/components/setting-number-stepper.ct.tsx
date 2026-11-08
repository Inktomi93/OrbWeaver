// @subject packages/ui/src/primitives/number-field/variants.ts
// The steppers keep the touch-target token as their own box inside the bordered settings group, where a flush child is 2px short.
import { expect, test } from "@playwright/test";
import type { SettingNumberStory } from "./_setting-number-stories.tsx";

const STORY = "tests/client/components/_setting-number-stories/SettingNumberStory";

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 740 } });

  test("each stepper box is the touch-target token tall inside a settings group", async ({ mount }) => {
    const component = await mount<typeof SettingNumberStory>(STORY, {});
    const token = await component.locator('[data-probe="touch-target"]').evaluate((node) => node.getBoundingClientRect().height);
    for (const name of ["Decrease Auto-continue rounds", "Increase Auto-continue rounds"]) {
      const box = await component.getByRole("button", { name, exact: true }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(token);
    }
  });
});
