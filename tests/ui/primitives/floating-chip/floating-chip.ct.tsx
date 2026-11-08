// A FloatingChip is a pill on the popover fill that floats on the overlay shadow, and comes and goes with its presence.

import { computedStyle } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { FloatingChipStory } from "./_floating-chip-stories.tsx";

const STORY = "tests/ui/primitives/floating-chip/_floating-chip-stories/FloatingChipStory";

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: the chip paints the popover fill and ink in a pill on the overlay shadow, in and out of a tier`, async ({ mount }) => {
    const component = await mount<typeof FloatingChipStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => computedStyle(component.locator(`[data-probe="${which}"]`), property);
    for (const kase of ["shown", "tier-shown"]) {
      const chip = component.locator(`[data-case="${kase}"]`);
      await expect(chip).toHaveAttribute("data-slot", "floating-chip");
      await expect(chip).toHaveAttribute("data-tone", "neutral");
      expect(await computedStyle(chip, "background-color"), kase).toBe(await probe("popover", "background-color"));
      expect(await computedStyle(chip, "color"), kase).toBe(await probe("popover", "color"));
      expect(await computedStyle(chip, "border-block-start-color"), kase).toBe(await probe("edge", "border-block-start-color"));
      expect(await computedStyle(chip, "border-start-start-radius"), kase).toBe(await probe("pill", "border-start-start-radius"));
      expect(await computedStyle(chip, "box-shadow"), kase).toBe(await probe("lift", "box-shadow"));
    }
  });

  test(`${name}: a shown chip takes the pointer and a hidden one fades out and takes none`, async ({ mount }) => {
    const component = await mount<typeof FloatingChipStory>(STORY, props);
    await expect.poll(() => computedStyle(component.locator('[data-case="hidden"]'), "opacity")).toBe("0");
    expect(await computedStyle(component.locator('[data-case="hidden"]'), "pointer-events")).toBe("none");
    await expect.poll(() => computedStyle(component.locator('[data-case="shown"]'), "opacity")).toBe("1");
    expect(await computedStyle(component.locator('[data-case="shown"]'), "pointer-events")).toBe("auto");
  });
}
