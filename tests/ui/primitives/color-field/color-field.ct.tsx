// CT: the color-field seal — the swatch-only display variant, the editable swatch-trigger →
// popover (native <input type="color"> + the ALWAYS-present hex text alternative), label
// association via Field.Control, and the D44 clamp reuse (rejects url()/expression()).
import { ColorField, ColorSwatch } from "@orb/ui/color-field";
import { expect, test } from "@playwright/experimental-ct-react";
import { ColorFieldHarness } from "./color-field.fixtures";

const STYLE_URL_RE = /url/u;

function noop(): void {
  // Intentional no-op — this test only checks the disabled trigger's DOM state, not commits.
}

test("ColorSwatch renders a plain display-only chip — no button, no popover", async ({ mount }) => {
  const swatch = await mount(<ColorSwatch label="#336699" value="#336699" />);
  await expect(swatch.getByRole("button")).toHaveCount(0);
  await expect(swatch).toContainText("#336699");
  const chip = swatch.locator('[data-slot="color-swatch-chip"]');
  await expect(chip).toHaveCSS("background-color", "rgb(51, 102, 153)");
});

test("ColorSwatch drops an unsafe value instead of applying it as a style", async ({ mount }) => {
  const swatch = await mount(<ColorSwatch value="url(evil.css)" />);
  const chip = swatch.locator('[data-slot="color-swatch-chip"]');
  // No inline background-color was ever set — the computed value falls back to the token default,
  // not the hostile string (a `style` attribute carrying `url(...)` would be the injection vector).
  await expect(chip).not.toHaveAttribute("style", STYLE_URL_RE);
});

test("inside a <Field>, the label associates with the swatch trigger button (Field.Control registration)", async ({
  mount,
}) => {
  const page = await mount(<ColorFieldHarness />);
  const trigger = page.getByLabel("Accent");
  await expect(trigger).toHaveAttribute("type", "button");
});

test("opening the editable field always shows the hex text alternative alongside the native picker", async ({
  mount,
  page,
}) => {
  await mount(<ColorFieldHarness />);
  await page.getByLabel("Accent").click();
  await expect(page.locator('[data-slot="color-field-native-input"]')).toHaveAttribute(
    "type",
    "color",
  );
  await expect(page.getByLabel("Hex")).toBeVisible();
});

test("typing a valid hex commits the value to the caller", async ({ mount, page }) => {
  await mount(<ColorFieldHarness />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  await hex.fill("#00ff00");
  await expect(page.getByTestId("committed-value")).toHaveText("#00ff00");
});

test("the clamp rejects a url() injection attempt — no commit, inline error shown", async ({
  mount,
  page,
}) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  await hex.fill("url(javascript:alert(1))");
  await expect(page.getByText("Enter a valid color")).toBeVisible();
  // The last-committed value is untouched — the hostile string never reached onValueChange.
  await expect(page.getByTestId("committed-value")).toHaveText("#111111");
});

test("the clamp rejects an expression() injection attempt — no commit, inline error shown", async ({
  mount,
  page,
}) => {
  await mount(<ColorFieldHarness initialValue="#111111" />);
  await page.getByLabel("Accent").click();
  const hex = page.getByLabel("Hex");
  // biome-ignore lint/security/noSecrets: a CSS injection payload under test, not a real secret.
  await hex.fill("expression(alert(1))");
  await expect(page.getByText("Enter a valid color")).toBeVisible();
  await expect(page.getByTestId("committed-value")).toHaveText("#111111");
});

test("the disabled swatch trigger is inert", async ({ mount, page }) => {
  await mount(<ColorField aria-label="Accent" disabled={true} onValueChange={noop} value="#fff" />);
  await expect(page.getByLabel("Accent")).toBeDisabled();
});
