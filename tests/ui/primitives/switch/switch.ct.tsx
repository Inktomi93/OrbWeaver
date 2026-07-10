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

// ── Defect #3 pins (owner: "toggles are very short and tiny and can barely show a difference between
// on and off"). Two regressions locked out: (1) the checked and unchecked tracks must wear DIFFERENT
// token values (not "barely a difference"); (2) the visible track must be a generous rectangle with a
// SUBSTANTIAL thumb travel (the old design collapsed to ~4px travel on fine pointers). done ≠ rendered
// — these assert the RENDERED geometry/colour, not the source. ──
test("checked vs unchecked wear DIFFERENT track token values (the on/off distinction pin)", async ({
  mount,
  page,
}) => {
  // The two states must map to genuinely different tokens — the "barely shows a difference" regression.
  expect(TOKENS["color.input"].value).not.toBe(TOKENS["color.primary"].value);
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const off = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  await control.click();
  await expect(control).toHaveCSS("background-color", TOKENS["color.primary"].value);
  const on = await control.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(on).not.toBe(off); // rendered colours actually diverge on/off, not just the source classes
});

test("the track is a generous rectangle and the thumb travels a substantial distance", async ({
  mount,
  page,
}) => {
  await mount(<Switch aria-label="Streaming" />);
  const control = page.getByRole("switch");
  const thumb = control.locator('[data-slot="switch-thumb"]');
  const track = await control.boundingBox();
  const offX = (await thumb.boundingBox())?.x ?? 0;
  // Rectangular, not the old near-square (48×32 → w > 1.4×h); the switch reads as a switch at a glance.
  expect((track?.width ?? 0) / (track?.height ?? 1)).toBeGreaterThan(1.4);
  await control.click();
  await expect(control).toHaveAttribute("aria-checked", "true");
  // Travel = switch-track − switch-thumb = 3rem − 2rem = 16px (thumb raised to 32px for the tap-target
  // floor, Task #76). The old fine-pointer travel was ~4px; assert well past that so a regression toward
  // a near-square track fails here. Poll past the 130ms transform transition (the thumb slides,
  // boundingBox tracks the transform mid-animation).
  await expect.poll(async () => (await thumb.boundingBox())?.x ?? 0).toBeGreaterThan(offX + 12);
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
