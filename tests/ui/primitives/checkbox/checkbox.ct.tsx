// CT: the checkbox seal — real role="checkbox" semantics (the styled span carries the role, a
// hidden input rides beside it). Pointer + keyboard toggle aria-checked; checked wears the primary
// token; indeterminate reports aria-checked="mixed".
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

const NON_EMPTY = /.+/u;

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" defaultChecked={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("indeterminate reports the mixed state", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Select all" indeterminate={true} />);
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "mixed");
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Checkbox
      aria-label="Remember me"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("checkbox").click();
  await expect.poll(() => seen.at(-1), { intervals: [20, 50, 100] }).toBe(true);
});

test("disabled blocks toggling and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" disabled={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-disabled", "");
  await expect(control).toHaveCSS("opacity", "0.5");
  await control.click({ force: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("read-only: blocks toggling but keeps the checked token + shows the lock glyph", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Archived" checked={true} readOnly={true} />);
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-readonly", "");
  // A read-only checkbox is NOT the disabled grey-out — it still wears the primary "checked" token.
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(control).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph takes over from the check mark. (The checkbox always
  // keepMounts check/dash/lock together — scope by lucide's own icon class to avoid ambiguity.)
  await expect(control.locator("svg.lucide-lock")).toBeVisible();
  await control.click();
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("non-read-only checkbox never shows the lock glyph", async ({ mount, page }) => {
  await mount(<Checkbox aria-label="Remember me" checked={true} />);
  await expect(page.getByRole("checkbox").locator("svg.lucide-lock")).toBeHidden();
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({ mount, page }) => {
  await mount(
    <Field error="Required" label="Terms">
      <Checkbox />
    </Field>,
  );
  const control = page.getByRole("checkbox");
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", resolvedTokenColor("color.destructive"));
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({ mount, page }) => {
  await mount(
    <Field description="Required to continue" label="Terms">
      <Checkbox />
    </Field>,
  );
  // getByLabel also matches the hidden native input Base UI rides beside the styled span (R2) —
  // scope to the accessible role so the assertion targets the actual control under test.
  const control = page.getByRole("checkbox", { name: "Terms" });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
