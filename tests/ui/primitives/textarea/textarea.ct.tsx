// CT: the textarea seal — a multi-line control that accepts input and wears the token skin
// (border-border oklch) plus native field-sizing autosize.
import { Field } from "@orb/ui/field";
import { Textarea } from "@orb/ui/textarea";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const NON_EMPTY = /.+/u;

test("inside a <Field>, the label associates with the textarea (Field.Control registration)", async ({
  mount,
  page,
}) => {
  await mount(
    <Field label="Bio" description="A short blurb">
      <Textarea />
    </Field>,
  );
  // getByLabel resolves only if the label's htmlFor points at the textarea's id — i.e. the control
  // registered with the Field context (a plain <textarea> would fail this).
  const control = page.getByLabel("Bio");
  await expect(control).toBeVisible();
  await control.fill("hello");
  await expect(control).toHaveValue("hello");
  // and the description is wired via aria-describedby
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("accepts multi-line input", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" placeholder="Describe the scene…" />);
  const control = page.getByRole("textbox");
  await control.fill("A tavern at dusk.\nRain on the shutters.");
  await expect(control).toHaveValue("A tavern at dusk.\nRain on the shutters.");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({
  mount,
  page,
}) => {
  await mount(
    <Field error="Required" label="Bio">
      <Textarea />
    </Field>,
  );
  const control = page.getByRole("textbox");
  // Base UI Field.Control marks the control invalid — the seal keys its skin off data-invalid.
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", TOKENS["color.destructive"].value);
});

test("wears the token skin and autosizes to content", async ({ mount, page }) => {
  await mount(<Textarea aria-label="Scene" />);
  const control = page.getByRole("textbox");
  const border = await control.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).toContain("oklch");
  const sizing = await control.evaluate((el) => getComputedStyle(el).fieldSizing);
  expect(sizing).toBe("content");
});
