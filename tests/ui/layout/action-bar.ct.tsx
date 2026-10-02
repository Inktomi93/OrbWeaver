import { expect, test } from "@playwright/experimental-ct-react";
import { ActionBarFixture } from "./action-bar.fixtures.tsx";

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true });

test("actual container fit moves keyed groups, preserving focus and state without a viewport change", async ({ mount, page }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  const host = component.locator('[data-slot="action-bar-host"]');
  const order = (): Promise<string[]> => bar.locator(":scope > div").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slot") ?? ""));
  await expect(bar).toHaveAttribute("data-stacked", "false");
  expect(await order()).toEqual(["action-bar-leading", "action-bar-primary", "action-bar-trailing"]);
  await component.getByRole("button", { name: "Primary 0", exact: true }).click();
  const primary = component.getByRole("button", { name: "Primary 1", exact: true });
  await primary.focus();
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "322px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(primary).toBeFocused();
  expect(await order()).toEqual(["action-bar-primary", "action-bar-leading", "action-bar-trailing"]);
  await page.keyboard.press("Tab");
  await expect(component.getByRole("button", { name: "Swipe", exact: true })).toBeFocused();
  await primary.focus();
  await host.evaluate((node) => {
    (node as HTMLElement).style.width = "600px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect(primary).toBeFocused();
  await component.getByRole("button", { name: "Read ref", exact: true }).click();
  await expect(component.getByRole("status", { name: "Ref slot" })).toHaveText("action-bar");
});

test("an added control changes the fit and removing it restores the wide row", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await component.getByRole("button", { name: "Toggle extra", exact: true }).click();
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(component.getByRole("button", { name: "Stop draft", exact: true })).toBeVisible();
  const boxes = await bar.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.min(...boxes)).toBeGreaterThanOrEqual(48);
  await component.getByRole("button", { name: "Toggle extra", exact: true }).click();
  await expect(bar).toHaveAttribute("data-stacked", "false");
});

test("inline padding reduces available fit and cannot orphan Send", async ({ mount }) => {
  const component = await mount(<ActionBarFixture />);
  const bar = component.locator('[data-slot="action-bar"]');
  await expect(bar).toHaveAttribute("data-stacked", "false");
  const primary = component.getByRole("button", { name: "Primary 0", exact: true });
  await primary.focus();
  await bar.evaluate((node) => {
    (node as HTMLElement).style.paddingInline = "24px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "true");
  await expect(primary).toBeFocused();
  expect(await bar.locator(":scope > div").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-slot")))).toEqual([
    "action-bar-primary",
    "action-bar-leading",
    "action-bar-trailing",
  ]);
  await expect
    .poll(async () => {
      const rows = await bar.evaluate((root) => [...root.children].map((node) => node.getBoundingClientRect().top));
      return { primaryAbove: (rows[0] ?? 0) < (rows[1] ?? 0), pairTogether: rows[1] === rows[2] };
    })
    .toEqual({ primaryAbove: true, pairTogether: true });
  await bar.evaluate((node) => {
    (node as HTMLElement).style.paddingInline = "0px";
  });
  await expect(bar).toHaveAttribute("data-stacked", "false");
  await expect(primary).toBeFocused();
});
