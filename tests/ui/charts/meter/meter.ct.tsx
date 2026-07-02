// <Meter> CT — the rpg-design/11 §13 required cases: every kind renders from PLAIN props (no
// contracts import — the fixtures are RpgHudView-SHAPED literals), ARIA meter values, bipolar
// milestone ticks, and the dangerBelow token swap asserted against the destructive oklch value.
import { Meter } from "@orb/ui/meter";
import { expect, test } from "@playwright/experimental-ct-react";

// --color-destructive — the danger INTENT token (theme.css; a token swap, never a color calc).
const DESTRUCTIVE_OKLCH = "oklch(0.62 0.19 25)";

test("linear renders from plain props with correct ARIA meter values", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={30} max={60} label="HP" />);
  await expect(component).toHaveRole("meter");
  await expect(component).toHaveAttribute("aria-valuemin", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "60");
  await expect(component).toHaveAttribute("aria-valuenow", "30");
  await expect(component).toHaveAttribute("aria-label", "HP");
  // 30/60 → the fill spans half the track.
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
  const tag = await component.evaluate((el) => el.tagName.toLowerCase());
  expect(tag).toBe("svg");
});

test("bipolar takes a −max..max domain by default and renders milestone ticks", async ({
  mount,
}) => {
  const component = await mount(
    <Meter kind="bipolar" value={40} milestones={[-50, 0, 50]} label="Reputation" />,
  );
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
  const component = await mount(
    <Meter kind="linear" value={10} max={100} dangerBelow={25} label="HP" />,
  );
  const color = await component
    .locator('[data-slot="fill"]')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).toContain(DESTRUCTIVE_OKLCH);
});

test("at or above dangerBelow the fill stays on the primary token", async ({ mount }) => {
  const component = await mount(
    <Meter kind="linear" value={25} max={100} dangerBelow={25} label="HP" />,
  );
  const color = await component
    .locator('[data-slot="fill"]')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(color).not.toContain(DESTRUCTIVE_OKLCH);
});

test("dangerBelow swaps the arc stroke color too (one mechanism across kinds)", async ({
  mount,
}) => {
  const component = await mount(
    <Meter kind="arc" value={5} max={100} dangerBelow={25} label="Pool" />,
  );
  const color = await component
    .locator('[data-slot="fill"]')
    .evaluate((el) => getComputedStyle(el).stroke);
  expect(color).toContain(DESTRUCTIVE_OKLCH);
});

test("value is clamped into the min/max domain for ARIA", async ({ mount }) => {
  const component = await mount(<Meter kind="linear" value={150} max={100} label="HP" />);
  await expect(component).toHaveAttribute("aria-valuenow", "100");
});
