// CT: the panel edge control names itself with the house verbs, reports its state, and stays one control.
import { expect, test } from "@playwright/experimental-ct-react";
import { PanelEdgeControlHarness } from "./panel-edge-control.fixtures.tsx";

test("one control that flips its verb and its state with the panel", async ({ mount, page }) => {
  await mount(<PanelEdgeControlHarness edge="end" />);
  const control = page.getByRole("button", { name: /plugin panels$/ });
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName("Hide plugin panels");
  await expect(control).toHaveAttribute("aria-expanded", "true");
  await expect(control).toHaveAttribute("aria-controls", "panel-under-test");

  const spot = await control.boundingBox();
  await control.click();
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName("Show plugin panels");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  // The same box: open and closed share one spot.
  await expect.poll(async () => (await control.boundingBox())?.x).toBe(spot?.x);
  await expect.poll(async () => (await control.boundingBox())?.y).toBe(spot?.y);
});

test("it opens and closes from the keyboard", async ({ mount, page }) => {
  await mount(<PanelEdgeControlHarness edge="start" />);
  const control = page.getByRole("button", { name: /plugin panels$/ });
  await control.focus();
  await page.keyboard.press("Enter");
  await expect(control).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(control).toHaveAttribute("aria-expanded", "true");
});
