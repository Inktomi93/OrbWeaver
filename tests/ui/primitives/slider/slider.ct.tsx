// CT: the slider seal — keyboard steps the value through real ARIA (aria-valuenow), min/max
// clamp holds, and the drag surface meets the 44px touch floor.
import { Field } from "@orb/ui/field";
import { Slider } from "@orb/ui/slider";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;

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
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(55);
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
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toEqual([21, 79]);
});

test("Home/End/PageUp/PageDown jump to bounds and by the large step", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} label="Volume" max={100} min={0} />);
  const thumb = page.getByRole("slider");
  await thumb.press("PageUp");
  await expect(thumb).toHaveAttribute("aria-valuenow", "60");
  await thumb.press("PageDown");
  await thumb.press("PageDown");
  await expect(thumb).toHaveAttribute("aria-valuenow", "40");
  await thumb.press("End");
  await expect(thumb).toHaveAttribute("aria-valuenow", "100");
  await thumb.press("Home");
  await expect(thumb).toHaveAttribute("aria-valuenow", "0");
});

test("disabled blocks stepping and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Slider defaultValue={50} disabled={true} label="Volume" />);
  // Slider.Thumb renders an outer styled <div> (our data-slot + skin) wrapping a visually-hidden
  // native <input type="range"> — role="slider" resolves to THAT inner input (the real interactive
  // node), so state/skin assertions target the outer div by data-slot instead.
  const thumbEl = page.locator('[data-slot="slider-thumb"]');
  await expect(thumbEl).toHaveAttribute("data-disabled", "");
  const thumb = page.getByRole("slider");
  await thumb.press("ArrowRight");
  await expect(thumb).toHaveAttribute("aria-valuenow", "50");
});

test("inside an invalid <Field>, data-invalid lands and the track swaps to the destructive token", async ({
  mount,
  page,
}) => {
  await mount(
    <Field error="Out of range" label="Volume">
      <Slider defaultValue={50} />
    </Field>,
  );
  const thumbEl = page.locator('[data-slot="slider-thumb"]');
  await expect(thumbEl).toHaveAttribute("data-invalid", "");
  await expect(thumbEl).toHaveCSS("border-top-color", TOKENS["color.destructive"].value);
});

test("inside a <Field>, the slider associates and aria-describedby wires the description", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="0 to 100" label="Volume">
      <Slider defaultValue={50} />
    </Field>,
  );
  const thumb = page.getByRole("slider");
  await expect(thumb).toHaveAttribute("aria-describedby", NON_EMPTY);
  await expect(thumb).toHaveAccessibleName("Volume");
});
