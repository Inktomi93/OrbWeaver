// CT: the reveal-gate PRIVACY seal — children are conditionally MOUNTED (never CSS-hidden) until
// an explicit Reveal click, so a shared-screen viewer (or devtools/screen-reader probing) cannot
// read the secret pre-reveal. This is the security contract the primitive exists for (R7).
import { RevealGate } from "@orb/ui/reveal-gate";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { ControlledHarness } from "./reveal-gate.fixtures";

test("before reveal the secret is not in the DOM at all", async ({ mount, page }) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await expect(page.getByText("sk-secret-token-12345")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal" })).toBeVisible();
});

test("the placeholder is a neutral masked panel (token surface, not the secret)", async ({
  mount,
}) => {
  const gate = await mount(<RevealGate>sk-secret-token-12345</RevealGate>);
  const placeholder = gate.locator('[data-slot="reveal-gate-placeholder"]');
  await expect(placeholder).toHaveCSS("background-color", TOKENS["color.muted"].value);
});

test("clicking Reveal mounts the children", async ({ mount, page }) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).click();

  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal" })).toHaveCount(0);
});

test("the re-hide affordance unmounts the children again", async ({ mount, page }) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();

  await page.getByRole("button", { name: "Hide" }).click();

  await expect(page.getByText("sk-secret-token-12345")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reveal" })).toBeVisible();
});

test("hideable=false omits the re-hide affordance", async ({ mount, page }) => {
  await mount(<RevealGate hideable={false}>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).click();

  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide" })).toHaveCount(0);
});

test("uncontrolled: defaultRevealed seeds the initial state and toggles freely", async ({
  mount,
  page,
}) => {
  await mount(<RevealGate defaultRevealed={true}>sk-secret-token-12345</RevealGate>);

  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByText("sk-secret-token-12345")).toHaveCount(0);
});

test("controlled: the caller drives revealed via onReveal", async ({ mount, page }) => {
  await mount(<ControlledHarness />);

  await expect(page.getByText("sk-secret-token-12345")).toHaveCount(0);

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();
  await expect(page.getByTestId("call-count")).toHaveText("1");

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByText("sk-secret-token-12345")).toHaveCount(0);
  await expect(page.getByTestId("call-count")).toHaveText("2");
});

test("the reveal button is keyboard-operable", async ({ mount, page }) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("sk-secret-token-12345")).toBeVisible();
});

test("a custom label renders on the reveal trigger", async ({ mount, page }) => {
  await mount(<RevealGate label="Show API key">secret</RevealGate>);

  await expect(page.getByRole("button", { name: "Show API key" })).toBeVisible();
});

test("the reveal trigger carries aria-expanded=false; the hide trigger aria-expanded=true", async ({
  mount,
  page,
}) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await expect(page.getByRole("button", { name: "Reveal" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
});

test("revealing announces via an aria-live region", async ({ mount, page }) => {
  await mount(<RevealGate label="API key">sk-secret-token-12345</RevealGate>);

  const announcement = page.locator('[data-slot="reveal-gate-announcement"]');
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveText("");

  await page.getByRole("button", { name: "API key" }).click();
  await expect(announcement).toHaveText("API key revealed");

  await page.getByRole("button", { name: "Hide" }).click();
  await expect(announcement).toHaveText("API key hidden");
});

test("focus moves to the Hide trigger on reveal", async ({ mount, page }) => {
  await mount(<RevealGate>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByRole("button", { name: "Hide" })).toBeFocused();
});

test("focus moves to the content wrapper on reveal when hideable=false", async ({
  mount,
  page,
}) => {
  await mount(<RevealGate hideable={false}>sk-secret-token-12345</RevealGate>);

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(page.locator('[data-slot="reveal-gate-content"]')).toBeFocused();
});

test("disabled prevents revealing", async ({ mount, page }) => {
  await mount(<RevealGate disabled={true}>sk-secret-token-12345</RevealGate>);

  const trigger = page.getByRole("button", { name: "Reveal" });
  await expect(trigger).toBeDisabled();
});

test("disabled prevents re-hiding", async ({ mount, page }) => {
  await mount(
    <RevealGate defaultRevealed={true} disabled={true}>
      sk-secret-token-12345
    </RevealGate>,
  );

  await expect(page.getByRole("button", { name: "Hide" })).toBeDisabled();
});
