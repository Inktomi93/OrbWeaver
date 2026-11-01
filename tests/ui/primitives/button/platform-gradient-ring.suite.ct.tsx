// The gradient ring paints its border only: a masked gradient on the `::after` of the CTA and the active tab, under every
// seed palette. A fallback border painted in its place reads `background-image: none` and no mask.

import { keysOf } from "@orb/testkit/iso";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { GradientRingStory } from "./_gradient-ring-stories.tsx";

const STORY = "tests/ui/primitives/button/_gradient-ring-stories/GradientRingStory";
const CASES = [{ name: "hearth seed" }, ...keysOf(SEED_THEME_VALUE_SETS).map((theme) => ({ name: `${theme} seed`, theme }))];

function ringPaint(carrier: Locator): Promise<{ image: string; mask: string; clip: string; border: string; transparent: string }> {
  return carrier.evaluate((element) => {
    const ring = getComputedStyle(element, "::after");
    const probe = document.createElement("i");
    probe.style.color = "transparent";
    element.append(probe);
    const transparent = getComputedStyle(probe).color;
    probe.remove();
    return {
      image: ring.getPropertyValue("background-image"),
      mask: ring.getPropertyValue("mask-image"),
      clip: ring.getPropertyValue("mask-clip"),
      border: ring.getPropertyValue("border-top-color"),
      transparent,
    };
  });
}

for (const { name, ...props } of CASES) {
  test(`${name}: the CTA and the active tab paint the masked gradient ring`, async ({ mount, page }) => {
    const component = await mount<typeof GradientRingStory>(STORY, props);
    const carriers = {
      "the CTA": component.getByRole("button", { name: "Call to action", exact: true }),
      "the active tab": component.getByRole("tab", { name: "First", exact: true }),
    };
    await expect(carriers["the active tab"]).toHaveAttribute("data-active", "");
    for (const [label, carrier] of Object.entries(carriers)) {
      const paint = await ringPaint(carrier);
      expect(paint.image, `${label} paints its gradient`).toContain("linear-gradient");
      expect(paint.mask, `${label} masks it`).not.toBe("none");
      expect(paint.clip, `${label} clips the mask to the border`).toBe("padding-box, border-box");
      expect(paint.border, `${label} leaves the border to the gradient`).toBe(paint.transparent);
    }
    await expect(page.locator("body")).toBeVisible();
  });
}
