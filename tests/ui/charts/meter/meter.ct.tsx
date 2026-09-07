// <Meter> CT — the rpg-design/11 §13 required cases: every kind renders from PLAIN props (no
// contracts import — the fixtures are RpgHudView-SHAPED literals), ARIA meter values, bipolar
// milestone ticks, and the dangerBelow token swap asserted against the destructive oklch value.
import { Meter } from "@orb/ui/meter";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/node/resolved-token-color.ts";

// --color-destructive — the danger INTENT token (a token swap, never a color calc).
const DESTRUCTIVE = resolvedTokenColor("color.destructive");

test("linear renders from plain props with correct ARIA meter values", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" />);
  await expect(component).toHaveRole("meter");
  await expect(component).toHaveAttribute("aria-valuemin", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "60");
  await expect(component).toHaveAttribute("aria-valuenow", "30");
  await expect(component).toHaveAttribute("aria-label", "HP");
  await expect.poll(async () => await component.locator('[data-slot="fill"]').getAttribute("style")).toContain("width: 50%");
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
  await expect.poll(async () => await component.evaluate((el) => el.tagName.toLowerCase())).toBe("div");
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
  await expect.poll(async () => await component.locator('[data-slot="fill"]').getAttribute("style")).toContain("left: 50%");
  await expect.poll(async () => await component.locator('[data-slot="fill"]').getAttribute("style")).toContain("width: 20%");
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

test("aria-valuetext announces the value on its OWN scale by default, never a percent of the range", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" />);
  // Scale honesty (schema-renderer §3.4; live-drive D1): a 30/60 meter announces "30 of 60", NOT "50%".
  // Base UI's percent-of-range default is the exact defect this pins.
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).toBe("30 of 60");
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).not.toContain("%");
});

test("a schema-bounded 1-10 score announces on its own bounds, not as a percent (the D1 shape)", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={8} max={10} min={1} label="Overall score" />);
  // The live scar: aria-valuenow=8 on a 1-10 scale used to announce aria-valuetext="78%".
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).toBe("8 of 10");
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).not.toContain("78%");
});

test("readout='percent' opts back into Base UI's fraction-of-range announcement", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" readout="percent" />);
  // The escape hatch for a surface where a 0-100% reading IS the honest one.
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).toContain("50");
  await expect.poll(async () => await component.getAttribute("aria-valuetext")).toContain("%");
});

test("showValue renders the visible label + value readout on the meter's own scale and names the meter", async ({ mount, page }) => {
  const component = await mount(<Meter kind="linear" label="HP" max={60} showValue={true} value={30} />);
  await expect(component).toHaveRole("meter");
  // The visible label renders and names the meter via aria-labelledby.
  await expect(component.locator('[data-slot="meter-label"]')).toHaveText("HP");
  await expect(page.getByRole("meter", { name: "HP" })).toBeVisible();
  // The value readout speaks the meter's OWN scale (30/60), never a percent.
  await expect(component.locator('[data-slot="meter-value"]')).toHaveText("30/60");
});
