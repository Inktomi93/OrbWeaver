// <Meter> CT — the rpg-design/11 §13 required cases: every kind renders from PLAIN props (no
// contracts import — the fixtures are RpgHudView-SHAPED literals), ARIA meter values, bipolar
// milestone ticks, and the dangerBelow token swap asserted against the destructive oklch value.
import { Meter } from "@orb/ui/meter";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// --color-destructive — the danger INTENT token (a token swap, never a color calc).
const DESTRUCTIVE = TOKENS["color.destructive"].value;

test("linear renders from plain props with correct ARIA meter values", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" />);
  await expect(component).toHaveRole("meter");
  await expect(component).toHaveAttribute("aria-valuemin", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "60");
  await expect(component).toHaveAttribute("aria-valuenow", "30");
  await expect(component).toHaveAttribute("aria-label", "HP");
  const style = await component.locator('[data-slot="fill"]').getAttribute("style");
  expect(style).toContain("width: 50%");
});

test("arc renders an SVG gauge with the same ARIA mechanism", async ({ mount }) => {
  const component = await mount(<Meter kind="arc" value={75} label="Pool" />);
  await expect(component).toHaveRole("meter");
  await expect(component).toHaveAttribute("aria-valuemin", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "100");
  await expect(component).toHaveAttribute("aria-valuenow", "75");
  await expect(component.locator('[data-slot="fill"]')).toBeVisible();
  // The a11y shell is now Base UI Meter.Root (a <div role="meter">); the arc geometry is the nested
  // <svg> gauge (§10.4 hybrid).
  const rootTag = await component.evaluate((el) => el.tagName.toLowerCase());
  expect(rootTag).toBe("div");
  await expect(component.locator("svg")).toHaveCount(1);
});

test("bipolar takes a −max..max domain by default and renders milestone ticks", async ({ mount }) => {
  const component = await mount(<Meter kind="bipolar" value={40} milestones={[-50, 0, 50]} label="Reputation" />);
  await expect(component).toHaveAttribute("aria-valuemin", "-100");
  await expect(component).toHaveAttribute("aria-valuemax", "100");
  await expect(component).toHaveAttribute("aria-valuenow", "40");
  await expect(component.locator('[data-slot="tick"]')).toHaveCount(3);
  await expect(component.locator('[data-slot="origin"]')).toHaveCount(1);
  // value 40 in −100..100 → fill runs from the 50% origin to 70%.
  const style = await component.locator('[data-slot="fill"]').getAttribute("style");
  expect(style).toContain("left: 50%");
  expect(style).toContain("width: 20%");
});

test("dangerBelow swaps the linear fill to the destructive token", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={10} max={100} dangerBelow={25} label="HP" />);
  await expect(component.locator('[data-slot="fill"]')).toHaveCSS("background-color", DESTRUCTIVE);
});

test("at or above dangerBelow the fill stays on the primary token", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={25} max={100} dangerBelow={25} label="HP" />);
  await expect(component.locator('[data-slot="fill"]')).not.toHaveCSS("background-color", DESTRUCTIVE);
});

test("dangerBelow swaps the arc stroke color too (one mechanism across kinds)", async ({ mount }) => {
  const component = await mount(<Meter kind="arc" value={5} max={100} dangerBelow={25} label="Pool" />);
  await expect(component.locator('[data-slot="fill"]')).toHaveCSS("stroke", DESTRUCTIVE);
});

test("value is clamped into the min/max domain for ARIA", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={150} max={100} label="HP" />);
  await expect(component).toHaveAttribute("aria-valuenow", "100");
});

test("aria-valuetext comes from the Base UI shell for free (locale-aware)", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" />);
  // 30/60 → 50% of the range; Base UI Meter.Root formats aria-valuetext — we don't hand-roll it.
  const valueText = await component.getAttribute("aria-valuetext");
  expect(valueText).toContain("50");
});

test("showValue renders the visible label + value readout and names the meter", async ({ mount, page }) => {
  const component = await mount(<Meter kind="linear" label="HP" max={60} showValue={true} value={30} />);
  await expect(component).toHaveRole("meter");
  // The visible label renders and names the meter via aria-labelledby.
  await expect(component.locator('[data-slot="meter-label"]')).toHaveText("HP");
  await expect(page.getByRole("meter", { name: "HP" })).toBeVisible();
  // The value readout renders Base UI's formatted position (50%).
  await expect(component.locator('[data-slot="meter-value"]')).toContainText("50");
});
