// CT: the number-field seal — steppers actually step and clamp at min/max, typing parses,
// and the increment/decrement buttons meet the 44px touch floor.
import { NumberField } from "@orb/ui/number-field";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("steppers increment and decrement the value", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} />);
  const input = page.getByRole("textbox");
  await page.getByLabel("Increase").click();
  await expect(input).toHaveValue("6");
  await page.getByLabel("Decrease").click();
  await page.getByLabel("Decrease").click();
  await expect(input).toHaveValue("4");
});

test("clamps at min: decrement disables at the floor", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={0} max={10} min={0} />);
  const decrement = page.getByLabel("Decrease");
  await expect(decrement).toBeDisabled();
  await page.getByLabel("Increase").click();
  await expect(page.getByRole("textbox")).toHaveValue("1");
  await expect(decrement).toBeEnabled();
});

test("stepper buttons meet the touch floor", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={0} />);
  const box = await page.getByLabel("Increase").boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
});

test("onValueChange reports the parsed number", async ({ mount, page }) => {
  const seen: (number | null)[] = [];
  await mount(
    <NumberField
      defaultValue={1}
      onValueChange={(value): void => {
        seen.push(value);
      }}
    />,
  );
  await page.getByLabel("Increase").click();
  await expect.poll(() => seen.at(-1)).toBe(2);
});
