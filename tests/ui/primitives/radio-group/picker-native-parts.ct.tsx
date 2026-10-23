import { expect, test } from "@playwright/test";
import type { PickerNativePartsStory } from "./picker-native-parts-stories.tsx";

test("picture choices keep visible names, descriptions, one tab stop and a native selected indicator", async ({ mount, page }) => {
  const component = await mount<typeof PickerNativePartsStory>("tests/ui/primitives/radio-group/picker-native-parts-stories/PickerNativePartsStory");
  const group = component.getByRole("radiogroup", { name: "Sample picker", exact: true });
  const one = group.getByRole("radio", { name: "One", exact: true });
  const two = group.getByRole("radio", { name: "Two", exact: true });
  const three = group.getByRole("radio", { name: "Three", exact: true });
  await expect(one).toHaveAccessibleDescription("The first option, with a description long enough to wrap onto several lines in a narrow cell.");
  await expect(two).toHaveAccessibleDescription("Short.");
  await expect(three).toHaveAccessibleDescription("");
  await expect(three).not.toHaveAttribute("aria-describedby", /.+/);
  await expect(one).not.toHaveAttribute("aria-label", /.+/);
  await one.focus();
  await expect(one).toHaveAttribute("tabindex", "0");
  await expect(two).toHaveAttribute("tabindex", "-1");
  await expect(three).toHaveAttribute("tabindex", "-1");
  await expect(one).toBeChecked();
  const indicators = group.locator('[data-slot="radio-group-picker-item-check"]');
  await expect(indicators).toHaveCount(1);
  await expect(one.locator('[data-slot="radio-group-picker-item-check"]')).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(two).toBeFocused();
  await expect(two).toBeChecked();
  await expect(indicators).toHaveCount(1);
  await expect(two.locator('[data-slot="radio-group-picker-item-check"]')).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(one).toBeChecked();
  await one.click();
  await expect(one).toBeChecked();
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
});

test("wrapped picker rows retain equal widths and equal-height peers despite mixed descriptions", async ({ mount }) => {
  const component = await mount<typeof PickerNativePartsStory>("tests/ui/primitives/radio-group/picker-native-parts-stories/PickerNativePartsStory");
  const group = component.getByRole("radiogroup", { name: "Sample picker", exact: true });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await expect(group).toHaveCSS("display", "grid");
  await expect
    .poll(() =>
      group.getByRole("radio").evaluateAll((cells) => {
        const boxes = cells.map((cell) => cell.getBoundingClientRect());
        return {
          rows: new Set(boxes.map((box) => Math.round(box.y))).size,
          widths: new Set(boxes.map((box) => Math.round(box.width))).size,
          positive: boxes.every((box) => box.width > 0 && box.height > 0),
        };
      }),
    )
    .toEqual({ rows: 2, widths: 1, positive: true });
  await component.update({ width: 640 });
  await expect
    .poll(() =>
      group.getByRole("radio").evaluateAll((cells) => {
        const boxes = cells.map((cell) => cell.getBoundingClientRect());
        return { rows: new Set(boxes.map((box) => Math.round(box.y))).size, heights: new Set(boxes.map((box) => Math.round(box.height))).size };
      }),
    )
    .toEqual({ rows: 1, heights: 1 });
  await expect
    .poll(() =>
      group
        .locator('[data-slot="picker-cell-description"]')
        .first()
        .evaluate((element) => element.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(element).lineHeight)),
    )
    .toBe(true);
});

test("detailed pictures use two columns with snapped apertures and stable hover, focus and selection geometry", async ({ mount }) => {
  const component = await mount<typeof PickerNativePartsStory>("tests/ui/primitives/radio-group/picker-native-parts-stories/PickerNativePartsStory", {
    width: 640,
    detail: true,
    shape: "standard",
  });
  const group = component.getByRole("radiogroup", { name: "Sample picker", exact: true });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await expect.poll(() => group.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2);
  await expect
    .poll(() =>
      group.locator('[data-slot="picker-cell-art"]').evaluateAll((apertures) => {
        const boxes = apertures.map((aperture) => aperture.getBoundingClientRect());
        return boxes.length === 3 && boxes.every((box) => box.width > 0 && box.width === boxes[0]?.width && box.height === Math.round((box.width * 3) / 4));
      }),
    )
    .toBe(true);
  const third = group.getByRole("radio", { name: "Three", exact: true });
  const before = await third.boundingBox();
  expect(before).not.toBeNull();
  await third.hover();
  await expect.poll(() => third.boundingBox()).toEqual(before);
  await third.focus();
  await expect(third).toBeFocused();
  await expect.poll(() => third.boundingBox()).toEqual(before);
  await third.click();
  await expect(third).toBeChecked();
  await expect.poll(() => third.boundingBox()).toEqual(before);
});
