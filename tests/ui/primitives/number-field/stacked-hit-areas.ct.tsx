// @subject packages/ui/src/primitives/number-field/variants.ts
// Below the container step a stepped number field stacks its steppers on a line under the input. A tap at the input's centre lands on the
// input, and each stepper's hit area is still the touch target on both axes without reaching into the input.
import { hitExtent, setPlatformTextSize, touchFloorPx } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { StackedNumberFieldStory } from "./_stacked-stories.tsx";

const STORY = "tests/ui/primitives/number-field/_stacked-stories/StackedNumberFieldStory";
const STEPPER_NAMES = ["Decrease Count under test", "Increase Count under test"] as const;
// A phone column at the default text, and the narrow column the largest phone text leaves a stepped field.
const REGIMES = [
  { textSize: 1, width: 160 },
  { textSize: 3, width: 246 },
] as const;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

for (const { textSize, width } of REGIMES) {
  test(`a tap at the stacked input's centre takes the input, and each stepper keeps the touch target, at ${String(textSize * 100)}% text in a ${String(width)}px column`, async ({
    mount,
    page,
  }) => {
    await using _textSize = await setPlatformTextSize(page, textSize);
    const component = await mount<typeof StackedNumberFieldStory>(STORY, { width });
    const input = component.getByRole("textbox", { name: "Count under test", exact: true });
    const floor = await touchFloorPx(page);
    const group = component.locator('[data-slot="number-field-group"]');
    // The steppers are on their own line under the input: the field is the stacked arm, not the one-line arm.
    const inputBox = await input.boundingBox();
    const increase = component.getByRole("button", { name: STEPPER_NAMES[1], exact: true });
    const increaseBox = await increase.boundingBox();
    expect(increaseBox?.y ?? 0).toBeGreaterThanOrEqual((inputBox?.y ?? 0) + (inputBox?.height ?? 0) - 1);
    await expect(group).toBeVisible();

    await input.tap();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("4");

    for (const name of STEPPER_NAMES) {
      const stepper = component.getByRole("button", { name, exact: true });
      expect(await hitExtent(stepper, "x")).toBeGreaterThanOrEqual(floor);
      expect(await hitExtent(stepper, "y")).toBeGreaterThanOrEqual(floor);
    }
  });
}
