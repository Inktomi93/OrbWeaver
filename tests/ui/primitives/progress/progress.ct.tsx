// CT: the progress seal — a determinate bar reports its value through aria-valuenow; the
// indeterminate state (value={null}) drops aria-valuenow and flips Base UI's data-indeterminate.
import { Progress } from "@orb/ui/progress";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("determinate progress reflects its value", async ({ mount, page }) => {
  await mount(<Progress aria-label="Uploading" value={72} />);
  const bar = page.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "72");
  await expect(bar).toHaveAttribute("aria-valuemax", "100");
});

test("indeterminate progress has no value", async ({ mount, page }) => {
  await mount(<Progress aria-label="Working" value={null} />);
  const bar = page.getByRole("progressbar");
  expect(await bar.getAttribute("aria-valuenow")).toBeNull();
  await expect(bar).toHaveAttribute("data-indeterminate", "");
});

test("showValue renders the percentage readout and the label", async ({ mount, page }) => {
  await mount(<Progress label="Uploading" showValue={true} value={72} />);
  await expect(page.locator('[data-slot="progress-value"]')).toHaveText("72%");
  await expect(page.locator('[data-slot="progress-label"]')).toHaveText("Uploading");
});

test("indeterminate hides the value readout", async ({ mount, page }) => {
  await mount(<Progress aria-label="Working" showValue={true} value={null} />);
  // The Value element mounts but renders nothing while indeterminate (formatter returns null).
  await expect(page.locator('[data-slot="progress-value"]')).toBeEmpty();
});

test("an in-progress bar has no data-complete and wears the primary token", async ({ mount, page }) => {
  await mount(<Progress aria-label="Uploading" value={72} />);
  const indicator = page.locator('[data-slot="progress-indicator"]');
  await expect(indicator).not.toHaveAttribute("data-complete", "");
  await expect(indicator).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("a completed bar (value === max) sets data-complete and swaps to the success token", async ({ mount, page }) => {
  await mount(<Progress aria-label="Uploading" value={100} />);
  const indicator = page.locator('[data-slot="progress-indicator"]');
  await expect(indicator).toHaveAttribute("data-complete", "");
  await expect(indicator).toHaveCSS("background-color", TOKENS["color.success"].value);
});
