// CT: the slider seal — keyboard steps the value through real ARIA (aria-valuenow), min/max
// clamp holds, and the drag surface meets the 44px touch floor.
import { Slider } from "@orb/ui/slider";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("ArrowRight steps the value up; clamps at max", async ({ mount, page }) => {
  await mount(<Slider defaultValue={99} label="Volume" max={100} min={0} />);
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
});

test("respects step and reports through onValueChange", async ({ mount, page }) => {
  const seen: number[] = [];
  await mount(
    <Slider
      defaultValue={50}
      label="Temperature"
      max={100}
      min={0}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      step={5}
    />,
  );
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "55");
  await expect.poll(() => seen.at(-1)).toBe(55);
});

test("the interactive surface meets the touch floor", async ({ mount }) => {
  const slider = await mount(<Slider defaultValue={50} label="Volume" />);
  const box = await slider.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
});
