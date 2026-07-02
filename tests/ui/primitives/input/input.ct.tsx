// CT: the input seal — token skin as computed style, the touch floor, and the
// value/onValueChange controlled-capable passthrough (ui-package-design §6.1).

import { Input } from "@orb/ui/input";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("wears the bg-input token and meets the touch floor", async ({ mount }) => {
  const input = await mount(<Input />);
  const box = await input.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  const background = await input.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.97 0.01 75");
});

test("typing updates the value and fires onValueChange", async ({ mount }) => {
  const seen: string[] = [];
  const input = await mount(
    <Input
      onValueChange={(value): void => {
        seen.push(value);
      }}
    />,
  );
  await input.fill("hearth");
  await expect(input).toHaveValue("hearth");
  await expect.poll(() => seen.at(-1)).toBe("hearth");
});
