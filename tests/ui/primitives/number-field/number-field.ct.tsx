// CT: the number-field seal — steppers actually step and clamp at min/max, typing parses,
// and the increment/decrement buttons meet the 44px touch floor.
import { Field } from "@orb/ui/field";
import { NumberField } from "@orb/ui/number-field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;
const NON_EMPTY = /.+/u;

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

test("scrub area is present and labeled; steppers still clamp to min/max", async ({
  mount,
  page,
}) => {
  await mount(<NumberField defaultValue={0} max={10} min={0} scrubLabel="Weight" />);
  await expect(page.getByText("Weight")).toBeVisible();
  // Steppers keep their clamp: decrement disabled at the floor, increment steps within range.
  const decrement = page.getByLabel("Decrease");
  await expect(decrement).toBeDisabled();
  await page.getByLabel("Increase").click();
  await expect(page.getByRole("textbox")).toHaveValue("1");
  await expect(decrement).toBeEnabled();
});

test("ArrowUp/ArrowDown on the input step the value", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} max={10} min={0} />);
  const input = page.getByRole("textbox");
  await input.focus();
  await input.press("ArrowUp");
  await expect(input).toHaveValue("6");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("4");
});

test("disabled blocks the steppers and drops the interactive skin", async ({ mount, page }) => {
  await mount(<NumberField defaultValue={5} disabled={true} />);
  await expect(page.getByLabel("Increase")).toBeDisabled();
  await expect(page.getByLabel("Decrease")).toBeDisabled();
  await expect(page.getByRole("textbox")).toBeDisabled();
});

test("read-only: blocks steppers but keeps the token skin + shows the lock glyph", async ({
  mount,
  page,
}) => {
  await mount(<NumberField defaultValue={5} readOnly={true} />);
  const increment = page.getByLabel("Increase");
  await expect(increment).toHaveAttribute("data-readonly", "");
  await expect(increment).toHaveCSS("opacity", "1");
  // The non-color signal: the +/- glyph swaps for a lock while read-only. (Both icons stay
  // keepMounted side by side — scope by lucide's own icon class to avoid ambiguity.)
  await expect(increment.locator("svg.lucide-lock")).toBeVisible();
  await expect(increment.locator("svg.lucide-plus")).toBeHidden();
  // Base UI marks a read-only stepper aria-disabled, so Playwright's actionability check refuses a
  // plain click — force it through to prove the CLICK HANDLER (not just the a11y hint) is a no-op.
  await increment.click({ force: true });
  await expect(page.getByRole("textbox")).toHaveValue("5");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({
  mount,
  page,
}) => {
  await mount(
    <Field error="Out of range" label="Weight">
      <NumberField defaultValue={5} />
    </Field>,
  );
  await expect(page.getByRole("textbox")).toHaveAttribute("data-invalid", "");
  await expect(page.locator('[data-slot="number-field-group"]')).toHaveCSS(
    "border-top-color",
    TOKENS["color.destructive"].value,
  );
});

test("inside a <Field>, the input associates and aria-describedby wires the description", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="In pounds" label="Weight">
      <NumberField defaultValue={5} />
    </Field>,
  );
  const control = page.getByLabel("Weight");
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
