// @subject packages/ui/src/primitives/select/variants.ts
// The inline Select is a text-height trigger at both pointers; its hit area reaches the touch-target token.
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { InlineSelectStory } from "./_inline-touch-floor-stories.tsx";

const STORY = "tests/ui/primitives/select/_inline-touch-floor-stories/InlineSelectStory";
// The least a finger target is, in CSS px; a mouse needs no floor beyond the token.
const FINGER_TARGET_PX = 44;

for (const coarse of [true, false]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse, isMobile: coarse, viewport: { width: 430, height: 740 } });

    test("the trigger stays text-height and its hit area is the touch-target token", async ({ mount, page }) => {
      expect(await page.evaluate((query) => matchMedia(query).matches, coarse ? MEDIA_QUERIES["pointer-coarse"] : MEDIA_QUERIES["pointer-fine"])).toBe(true);
      const component = await mount<typeof InlineSelectStory>(STORY);
      const trigger = component.getByRole("combobox", { name: "Whose pack", exact: true });
      const reading = await trigger.evaluate((node) => {
        const own = getComputedStyle(node);
        const area = getComputedStyle(node, "::before");
        const edges = Number.parseFloat(own.borderTopWidth) + Number.parseFloat(own.borderBottomWidth);
        const box = node.getBoundingClientRect();
        return {
          height: box.height,
          line: Number.parseFloat(own.lineHeight) + edges,
          area: Number.parseFloat(area.height),
          x: box.x + box.width / 2,
          below: box.bottom,
        };
      });
      const token = await component.locator('[data-probe="touch-target"]').evaluate((node) => node.getBoundingClientRect().height);
      expect(reading.height).toBeCloseTo(reading.line, 1);
      expect(reading.area).toBeCloseTo(token, 1);
      expect(reading.area).toBeGreaterThanOrEqual(coarse ? FINGER_TARGET_PX : reading.height);
      // A press just inside the hit area and past the visible box lands on the trigger.
      const reach = (reading.area - reading.height) / 2 - 1;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.getAttribute("data-slot"), [reading.x, reading.below + reach]);
      expect(hit).toBe("select-trigger");
    });
  });
}
