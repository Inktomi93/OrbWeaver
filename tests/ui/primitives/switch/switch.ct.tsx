// CT: the switch seal — real role="switch" semantics: pointer + keyboard toggle aria-checked,
// checked state lands as the primary token track. (Base UI renders the styled span + a hidden
// form input as siblings, so the role locator is the element under test, not the mount handle.)
import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const NON_EMPTY = /.+/u;

test("click toggles aria-checked", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("keyboard toggles too, and checked wears the primary token", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" defaultChecked={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("onCheckedChange reports the next state", async ({ mount, page }) => {
  const seen: boolean[] = [];
  await mount(
    <Switch
      aria-label="Streaming"
      onCheckedChange={(checked): void => {
        seen.push(checked);
      }}
    />,
  );
  await page.getByRole("switch").click();
  await expect.poll(() => seen.at(-1)).toBe(true);
});

test("read-only: blocks toggling but keeps the checked token + shows the lock glyph", async ({
  mount,
  page,
}) => {
  await mount(<Switch aria-label="Autopilot" checked={true} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-readonly", "");
  // A read-only switch is NOT the disabled grey-out — it still wears the primary "on" token.
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  await expect(control).toHaveCSS("opacity", "1");
  // The non-color signal: a lock glyph rides the thumb, visible only in the read-only state.
  await expect(control.locator("svg")).toBeVisible();
  // Clicking (and Space) must not flip the state — Base UI's readOnly behavior.
  await control.click();
  await control.press("Space");
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("read-only off state: unchecked token holds and the lock glyph still shows", async ({
  mount,
  page,
}) => {
  await mount(<Switch aria-label="Autopilot" checked={false} readOnly={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("aria-checked", "false");
  await expect(control.locator("svg")).toBeVisible();
});

test("non-read-only switch never shows the lock glyph", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" />);
  await expect(page.getByRole("switch").locator("svg")).toBeHidden();
});

test("disabled blocks toggling and drops the interactive skin", async ({ mount, page }) => {
  await mount(<Switch aria-label="Streaming" disabled={true} />);
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-disabled", "");
  await expect(control).toHaveCSS("opacity", "0.5");
  await control.click({ force: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("inside an invalid <Field>, data-invalid lands and the border swaps to destructive", async ({
  mount,
  page,
}) => {
  await mount(
    <Field error="Required" label="Streaming">
      <Switch />
    </Field>,
  );
  const control = page.getByRole("switch");
  await expect(control).toHaveAttribute("data-invalid", "");
  await expect(control).toHaveCSS("border-top-color", TOKENS["color.destructive"].value);
});

test("inside a <Field>, the label associates and aria-describedby wires the description", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="Live-updates as tokens arrive" label="Streaming">
      <Switch />
    </Field>,
  );
  // getByLabel also matches the hidden native input Base UI rides beside the styled span (R2) —
  // scope to the accessible role so the assertion targets the actual control under test.
  const control = page.getByRole("switch", { name: "Streaming" });
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});
