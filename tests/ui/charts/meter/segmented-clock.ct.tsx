// <SegmentedClock> CT — the rpg-design/11 §13 required states: 0 / partial / full / completed,
// plus the ARIA meter values. The clock knows nothing of fronts — fixtures are plain counts.
import { SegmentedClock } from "@orb/ui/meter";
import { expect, test } from "@playwright/experimental-ct-react";

test("0 filled: all segments render empty", async ({ mount }) => {
  const component = await mount(<SegmentedClock segments={6} filled={0} label="Doom" />);
  await expect(component.locator('[data-slot="segment"]')).toHaveCount(6);
  await expect(component.locator('[data-filled="true"]')).toHaveCount(0);
  await expect(component).toHaveAttribute("aria-valuenow", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "6");
});

test("partial fill: exactly `filled` segments carry the accent", async ({ mount }) => {
  const component = await mount(<SegmentedClock segments={8} filled={3} label="Alarm" />);
  await expect(component.locator('[data-slot="segment"]')).toHaveCount(8);
  await expect(component.locator('[data-filled="true"]')).toHaveCount(3);
  await expect(component).toHaveAttribute("aria-valuenow", "3");
});

test("full fill without completed: all segments filled, no completion emphasis", async ({
  mount,
}) => {
  const component = await mount(<SegmentedClock segments={4} filled={4} label="Front" />);
  await expect(component.locator('[data-filled="true"]')).toHaveCount(4);
  await expect(component.locator('[data-slot="completed-dot"]')).toHaveCount(0);
  await expect(component).toHaveAttribute("data-completed", "false");
});

test("completed: full accent on every segment plus the center-dot emphasis", async ({ mount }) => {
  const component = await mount(
    <SegmentedClock segments={6} filled={6} completed={true} label="Front" />,
  );
  await expect(component).toHaveAttribute("data-completed", "true");
  await expect(component.locator('[data-filled="true"]')).toHaveCount(6);
  await expect(component.locator('[data-slot="completed-dot"]')).toBeVisible();
  await expect(component).toHaveAttribute("aria-valuenow", "6");
});

test("role=meter with the filled/segments value semantics", async ({ mount }) => {
  const component = await mount(<SegmentedClock segments={12} filled={5} label="Ritual" />);
  await expect(component).toHaveRole("meter");
  await expect(component).toHaveAttribute("aria-valuemin", "0");
  await expect(component).toHaveAttribute("aria-valuemax", "12");
  await expect(component).toHaveAttribute("aria-valuenow", "5");
  await expect(component).toHaveAttribute("aria-label", "Ritual");
});
