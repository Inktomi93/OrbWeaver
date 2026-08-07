// CT: the progress seal — a determinate bar reports its value through aria-valuenow; the
// indeterminate state (value={null}) drops aria-valuenow and flips Base UI's data-indeterminate.
import { Progress } from "@orb/ui/progress";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("determinate progress reflects its value", async ({ mount, page }) => {
  await mount(<Progress aria-label="Uploading" value={72} />);
  const bar = page.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "72");
  await expect(bar).toHaveAttribute("aria-valuemax", "100");
});

test("indeterminate progress has no value", async ({ mount, page }) => {
  await mount(<Progress aria-label="Working" value={null} />);
  const bar = page.getByRole("progressbar");
  await expect(bar).not.toHaveAttribute("aria-valuenow");
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

// The readout and the bar must tell the SAME story. Base UI 1.7 normalizes the indicator to
// (value − min) / (max − min); a seal that recomputes `value / max` for its label disagrees the
// moment `min` is not 0 — the bar reads half full while the text claims 60%. Assert the rendered
// width against the rendered text, so neither side can be checked in isolation and pass.
test("with a custom min, the readout agrees with the indicator's rendered width", async ({ mount, page }) => {
  await mount(<Progress label="Charge" max={100} min={20} showValue={true} value={60} />);
  const track = page.locator('[data-slot="progress-track"]');
  const indicator = page.locator('[data-slot="progress-indicator"]');
  const trackWidth = (await track.boundingBox())?.width ?? 0;
  const indicatorWidth = (await indicator.boundingBox())?.width ?? 0;
  expect(trackWidth).toBeGreaterThan(0);
  const renderedPercent = Math.round((indicatorWidth / trackWidth) * 100);
  // (60 − 20) / (100 − 20) = 50%.
  expect(renderedPercent).toBe(50);
  await expect(page.locator('[data-slot="progress-value"]')).toHaveText(`${renderedPercent}%`);
});

// Out-of-range values clamp in the bar; the readout must clamp with it rather than print "150%".
test("a value past max clamps the readout to the same 100% the bar shows", async ({ mount, page }) => {
  await mount(<Progress label="Charge" showValue={true} value={150} />);
  const track = page.locator('[data-slot="progress-track"]');
  const indicator = page.locator('[data-slot="progress-indicator"]');
  const trackWidth = (await track.boundingBox())?.width ?? 0;
  const indicatorWidth = (await indicator.boundingBox())?.width ?? 0;
  expect(Math.round((indicatorWidth / trackWidth) * 100)).toBe(100);
  await expect(page.locator('[data-slot="progress-value"]')).toHaveText("100%");
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
  await expect(indicator).toHaveCSS("background-color", resolvedTokenColor("color.success"));
});
