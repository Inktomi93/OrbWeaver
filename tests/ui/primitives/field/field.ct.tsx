// CT: the labeled-form-row seal — Base UI wires label→control (getByLabel resolves the input),
// error renders in the destructive token and flips the control invalid (ui-package-design §6.1).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { expect, test } from "@playwright/experimental-ct-react";

test("wires the label to the composed control", async ({ mount, page }) => {
  await mount(
    <Field label="Display name">
      <Input />
    </Field>,
  );
  const input = page.getByLabel("Display name");
  await input.fill("Seraphina");
  await expect(input).toHaveValue("Seraphina");
});

test("error renders destructive and marks the control data-invalid", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Name">
      <Input />
    </Field>,
  );
  const error = page.getByText("Required");
  const color = await error.evaluate((el) => getComputedStyle(el).color);
  expect(color).toContain("oklch(0.62 0.19 25)");
  await expect(page.getByLabel("Name")).toHaveAttribute("data-invalid", "");
});

test("description renders muted below the control", async ({ mount, page }) => {
  await mount(
    <Field description="Shown on your profile" label="Name">
      <Input />
    </Field>,
  );
  const description = page.getByText("Shown on your profile");
  const color = await description.evaluate((el) => getComputedStyle(el).color);
  expect(color).toContain("oklch(0.71 0.013 68)");
});
