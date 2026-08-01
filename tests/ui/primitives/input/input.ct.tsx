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

// `layout="inline"` is the CLICK-TO-EDIT box (tracker values, ambient strip): the revealed input must
// occupy the same slot the display did, so it is text-height with the datum's inset — where the default
// `field` arm is a control. It replaces a call-site `!h-auto min-h-0 !px-field` bang string, so the receipt
// is the PAINTED difference between the two arms, read computed, not the class list.
test("layout=inline is a text-height box with the datum's inset, not the field control", async ({ mount, page }) => {
  await mount(
    <div style={{ width: 240 }}>
      <Input aria-label="field arm" />
      <Input aria-label="inline arm" layout="inline" />
    </div>,
  );
  const read = (name: string): Promise<{ height: number; paddingInline: number; fontSize: number }> =>
    page.getByLabel(name).evaluate((el) => {
      const s = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, paddingInline: Number.parseFloat(s.paddingLeft), fontSize: Number.parseFloat(s.fontSize) };
    });
  const [field, inline] = await Promise.all([read("field arm"), read("inline arm")]);
  // RELATIONAL (survives a token retune): the inline box is shorter, tighter and typed one step down …
  expect(inline.height).toBeLessThan(field.height);
  expect(inline.paddingInline).toBeLessThan(field.paddingInline);
  expect(inline.fontSize).toBeLessThan(field.fontSize);
  // … and against the resolved token, its inset IS --spacing-field (never a hardcoded px).
  const fieldToken = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-field)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
  expect(inline.paddingInline).toBeCloseTo(fieldToken, 1);
  // It keeps the editable chrome — this is still an input, not a label.
  await expect(page.getByLabel("inline arm")).toHaveCSS("background-color", TOKENS["color.input"].value);
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

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Shown to other players" label="Display name">
      <Input />
    </Field>,
  );
  const control = page.getByLabel("Display name");
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
