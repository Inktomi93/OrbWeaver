// CT: the shared labeled-frame both corpus-viz charts compose (ui-package-design §9). Asserts the
// data-slot selector contract (north-star rule 0.7) and the empty/non-empty branch.

import { LabeledChartFrame } from "@orb/ui/labeled-chart-frame";
import { expect, test } from "@playwright/experimental-ct-react";

test("non-empty renders the heading + children under the slot's data-slots", async ({ mount }) => {
  const frame = await mount(
    <LabeledChartFrame isEmpty={false} label="Top models" slot="bar-list">
      <div data-slot="test-canvas">canvas</div>
    </LabeledChartFrame>,
  );
  await expect(frame).toHaveAttribute("data-slot", "bar-list");
  const heading = frame.locator('[data-slot="bar-list-heading"]');
  await expect(heading).toHaveText("Top models");
  await expect(frame.locator('[data-slot="test-canvas"]')).toHaveText("canvas");
});

test("empty renders the EmptyState (label as title, no heading, no children)", async ({ mount }) => {
  const frame = await mount(
    <LabeledChartFrame isEmpty={true} label="Top models" slot="histogram">
      <div data-slot="test-canvas">canvas</div>
    </LabeledChartFrame>,
  );
  await expect(frame).toHaveAttribute("data-slot", "histogram");
  await expect(frame).toContainText("Top models");
  await expect(frame.locator('[data-slot="histogram-heading"]')).toHaveCount(0);
  await expect(frame.locator('[data-slot="test-canvas"]')).toHaveCount(0);
});
