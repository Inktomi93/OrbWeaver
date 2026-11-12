// @subject packages/ui/src/primitives/number-field/variants.ts
// Below the container step a stepped number field stacks its steppers under the input, on one line while two touch targets fit it and on a line
// each below that. A tap at the input's centre lands on the input, the input and each stepper keep the touch target, and no hit area leaves the
// field's own box, so a neighbouring field's tap is its own at the narrowest column a stepped field gets: one touch target wide.
import { hitExtent, setPlatformTextSize, touchFloorPx } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { StackedNumberFieldStory, TwoFieldRowStory } from "./_stacked-stories.tsx";

const STORY = "tests/ui/primitives/number-field/_stacked-stories/StackedNumberFieldStory";
const ROW_STORY = "tests/ui/primitives/number-field/_stacked-stories/TwoFieldRowStory";
const STEPPER_NAMES = ["Decrease Count under test", "Increase Count under test"] as const;
// A phone column at the default text, the columns the largest phone text leaves a stepped field (one line of two steppers needs two touch
// targets inside the group's edge, so 266px at the largest text), and a column narrower than one touch target, which the field widens to its floor.
const REGIMES = [
  { textSize: 1, width: 160 },
  { textSize: 3, width: 246 },
  { textSize: 3, width: 264 },
  { textSize: 3, width: 266 },
  { textSize: 3, width: 132 },
  { textSize: 3, width: 96 },
] as const;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

for (const { textSize, width } of REGIMES) {
  test(`a tap at the stacked input's centre takes the input, and the input and each stepper keep the touch target inside the field, at ${String(textSize * 100)}% text in a ${String(width)}px column`, async ({
    mount,
    page,
  }) => {
    await using _textSize = await setPlatformTextSize(page, textSize);
    const component = await mount<typeof StackedNumberFieldStory>(STORY, { width });
    const input = component.getByRole("textbox", { name: "Count under test", exact: true });
    const floor = await touchFloorPx(page);
    const group = component.locator('[data-slot="number-field-group"]');
    // The steppers are under the input: the field is the stacked arm, not the one-line arm.
    const inputBox = await input.boundingBox();
    const increase = component.getByRole("button", { name: STEPPER_NAMES[1], exact: true });
    const increaseBox = await increase.boundingBox();
    expect(increaseBox?.y ?? 0).toBeGreaterThanOrEqual((inputBox?.y ?? 0) + (inputBox?.height ?? 0) - 1);
    await expect(group).toBeVisible();
    // The field is never narrower than one touch target, so the narrowest column widens the field rather than the hit area leaving it.
    const groupBox = await group.boundingBox();
    expect(groupBox?.width ?? 0).toBeGreaterThanOrEqual(floor - 1);

    await input.tap();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("4");
    // The input is a touch control in its own right: its row is the step tall, not as tall as its text.
    expect(await hitExtent(input, "y")).toBeGreaterThanOrEqual(floor);

    for (const name of STEPPER_NAMES) {
      const stepper = component.getByRole("button", { name, exact: true });
      const box = await stepper.boundingBox();
      const reach = await hitExtent(stepper, "x");
      expect(reach).toBeGreaterThanOrEqual(floor);
      // The hit area is the stepper's own box: it does not leave the field on either side.
      expect(reach).toBeLessThanOrEqual((box?.width ?? 0) + 2);
      expect(await hitExtent(stepper, "y")).toBeGreaterThanOrEqual(floor);
    }
    // Two touch targets on one line share it; a narrower column gives each stepper a line.
    const decreaseBox = await component.getByRole("button", { name: STEPPER_NAMES[0], exact: true }).boundingBox();
    const sharesLine = Math.abs((decreaseBox?.y ?? 0) - (increaseBox?.y ?? 0)) < 1;
    expect(sharesLine).toBe((await group.evaluate((element) => element.clientWidth)) >= 2 * floor);
  });
}

for (const width of [132, 264]) {
  test(`a tap on the edge of one stacked field's stepper is the neighbour's own, with the largest text in ${String(width)}px columns`, async ({
    mount,
    page,
  }) => {
    await using _textSize = await setPlatformTextSize(page, 3);
    const component = await mount<typeof TwoFieldRowStory>(ROW_STORY, { width });
    const first = component.getByRole("textbox", { name: "First count", exact: true });
    const second = component.getByRole("textbox", { name: "Second count", exact: true });
    const increaseFirst = component.getByRole("button", { name: "Increase First count", exact: true });
    const decreaseSecond = component.getByRole("button", { name: "Decrease Second count", exact: true });
    const edge = await increaseFirst.boundingBox();
    const next = await decreaseSecond.boundingBox();
    expect(next?.x ?? 0).toBeGreaterThanOrEqual((edge?.x ?? 0) + (edge?.width ?? 0) - 1);
    // The first field's stepper's last pixel, and the second's first pixel, each take their own tap.
    await page.touchscreen.tap((edge?.x ?? 0) + (edge?.width ?? 0) - 2, (edge?.y ?? 0) + (edge?.height ?? 0) / 2);
    await expect(first).toHaveValue("5");
    await expect(second).toHaveValue("4");
    await page.touchscreen.tap((next?.x ?? 0) + 2, (next?.y ?? 0) + (next?.height ?? 0) / 2);
    await expect(second).toHaveValue("3");
    await expect(first).toHaveValue("5");
  });
}
