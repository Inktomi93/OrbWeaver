// CT: the status-chip seal — a background-job state chip composing Badge + WebSpinner
// (ui-primitive-carve-out-work-order item 7). role=status/aria-live=polite on transitions;
// failed carries a non-color icon signal plus an optional real retry <Button>.
import { StatusChip } from "@orb/ui/status-chip";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color.ts";

test("idle renders the neutral (muted) badge token with the Idle label", async ({ mount }) => {
  const component = await mount(<StatusChip status="idle" />);
  const badge = component.locator('[data-slot="status-chip-badge"]');
  await expect(badge).toHaveText("Idle");
  await expect(badge).toHaveCSS("background-color", TOKENS["color.muted"].value);
});

test("running renders the composed WebSpinner (role=status, animating glyph)", async ({ mount, page }) => {
  const component = await mount(<StatusChip status="running" />);
  // The root IS the mounted element (component.locator only searches its DESCENDANTS — the
  // avatar.ct.tsx `page.locator` precedent for asserting on the mount root itself).
  const root = page.locator('[data-slot="status-chip-root"]');
  await expect(root).toContainText("Running");
  await expect(component.locator('[data-slot="web-spinner"][data-animate]')).toBeVisible();
});

test("succeeded carries the Check icon glyph plus the success token background", async ({ mount }) => {
  const component = await mount(<StatusChip status="succeeded" />);
  const badge = component.locator('[data-slot="status-chip-badge"]');
  await expect(badge).toHaveText("Succeeded");
  await expect(badge.locator("svg")).toBeVisible();
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.success"));
});

test("failed carries an icon glyph (never color alone) plus the destructive token background", async ({ mount }) => {
  const component = await mount(<StatusChip status="failed" />);
  const badge = component.locator('[data-slot="status-chip-badge"]');
  await expect(badge).toHaveText("Failed");
  await expect(badge.locator("svg")).toBeVisible();
  await expect(badge).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
});

test("the root is a role=status aria-live=polite region", async ({ mount, page }) => {
  await mount(<StatusChip status="idle" />);
  const root = page.locator('[data-slot="status-chip-root"]');
  await expect(root).toHaveAttribute("role", "status");
  await expect(root).toHaveAttribute("aria-live", "polite");
});

test("a status transition updates the live region's rendered label", async ({ mount, page }) => {
  const component = await mount(<StatusChip status="running" />);
  const root = page.locator('[data-slot="status-chip-root"]');
  await expect(root).toHaveAttribute("aria-live", "polite");
  await component.update(<StatusChip status="succeeded" />);
  await expect(component.locator('[data-slot="status-chip-badge"]')).toHaveText("Succeeded");
});

test("summary and pre-formatted timestamp render as plain given strings", async ({ mount }) => {
  const component = await mount(<StatusChip status="running" summary="3 of 5 files" timestamp="2m ago" />);
  await expect(component.locator('[data-slot="status-chip-summary"]')).toHaveText("3 of 5 files");
  await expect(component.locator('[data-slot="status-chip-timestamp"]')).toHaveText("2m ago");
});

test("no retry button renders without onRetry, even when failed", async ({ mount }) => {
  const component = await mount(<StatusChip status="failed" />);
  await expect(component.locator('[data-slot="status-chip-retry"]')).toHaveCount(0);
});

test("onRetry renders a real button that fires on click, only on failed", async ({ mount }) => {
  let retried = false;
  const handleRetry = (): void => {
    retried = true;
  };
  const component = await mount(<StatusChip onRetry={handleRetry} status="failed" />);
  const retry = component.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();
  await retry.click();
  expect(retried).toBe(true);

  await component.update(<StatusChip onRetry={handleRetry} status="succeeded" />);
  await expect(component.getByRole("button", { name: "Retry" })).toHaveCount(0);
});

test("a custom retryLabel renders on the retry button", async ({ mount }) => {
  const component = await mount(<StatusChip onRetry={(): void => undefined} retryLabel="Try again" status="failed" />);
  await expect(component.getByRole("button", { name: "Try again" })).toBeVisible();
});
