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

test("showValue renders the formatted readout", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" showValue={true} />);
  await expect(page.locator("output")).toHaveText("50");
});

test("range: two thumbs report [lo, hi] and both are keyboard-operable", async ({
  mount,
  page,
}) => {
  const seen: number[][] = [];
  await mount(
    <Slider
      defaultValue={[20, 80]}
      label="Bounds"
      max={100}
      min={0}
      onValueChange={(value): void => {
        seen.push(value);
      }}
      showValue={true}
      thumbLabels={["Minimum", "Maximum"]}
    />,
  );
  const lo = page.getByRole("slider", { name: "Minimum" });
  const hi = page.getByRole("slider", { name: "Maximum" });
  await expect(page.getByRole("slider")).toHaveCount(2);
  await expect(lo).toHaveAttribute("aria-valuenow", "20");
  await expect(hi).toHaveAttribute("aria-valuenow", "80");
  // The Value readout formats both ends (Base UI joins with an en dash).
  await expect(page.locator("output")).toContainText("20");
  await expect(page.locator("output")).toContainText("80");

  await lo.press("ArrowRight");
  await expect(lo).toHaveAttribute("aria-valuenow", "21");
  await hi.press("ArrowLeft");
  await expect(hi).toHaveAttribute("aria-valuenow", "79");
  await expect.poll(() => seen.at(-1)).toEqual([21, 79]);
});
