// CT: the input seal — token skin as computed style, the touch floor, the
// value/onValueChange controlled-capable passthrough, disabled, and Field composability
// (ui-package-design §6.1; ui-primitive-contract R7).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;

test("wears the bg-input token", async ({ mount }) => {
  const input = await mount(<Input />);
  await expect(input).toHaveCSS("background-color", TOKENS["color.input"].value);
});

// The ≥44px floor is a COARSE-pointer guarantee (D62 P1) — the input height narrows on fine pointers,
// so this runs under an emulated coarse pointer (hasTouch → pointer:coarse, the tokens/index.ct.tsx
// precedent). Without it the default Desktop-Chrome CT is fine and the height is 28, not the floor.
test.describe("coarse pointer — the touch floor", () => {
  test.use({ hasTouch: true });

  test("meets the touch floor", async ({ mount }) => {
    const input = await mount(<Input />);
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  });
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
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe("hearth");
});

test("disabled blocks input and drops the interactive skin", async ({ mount }) => {
  const input = await mount(<Input disabled={true} />);
  await expect(input).toBeDisabled();
  await expect(input).toHaveCSS("opacity", "0.5");
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="Shown to other players" label="Display name">
      <Input />
    </Field>,
  );
  const control = page.getByLabel("Display name");
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
