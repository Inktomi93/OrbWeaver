// CT: <Heatmap> — the matrix heatmap. Covers what's genuinely DOM-observable (heading, canvas mount,
// empty state); the resolved-color / VisualMap gradient / cell-encoding wiring is asserted on the pure
// `buildHeatmapOption` builder in option.test.ts — a mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact.
import { Heatmap } from "@orb/ui/heatmap";
import { expect, test } from "@playwright/experimental-ct-react";

const MATRIX = {
  rows: ["Sun", "Mon", "Tue"],
  cols: ["00", "01", "02"],
  values: [
    [1, 2, 3],
    [0, 4, 1],
    [2, 0, 5],
  ],
};

test("renders the heading and a populated chart canvas for a non-empty matrix", async ({ mount }) => {
  const component = await mount(<Heatmap label="Activity" matrix={MATRIX} />);
  await expect(component.getByText("Activity")).toBeVisible();
  await expect(component.getByRole("img", { name: "Activity" })).toBeVisible();
  // ECharts paints the heatmap + its VisualMap gradient on separate zrender layers → several
  // stacked <canvas> elements; asserting the first one drew is the "populated, not thrown" guard.
  await expect(component.locator("canvas").first()).toBeVisible();
});

test("renders the empty state instead of a chart when the matrix has no rows", async ({ mount }) => {
  const component = await mount(<Heatmap label="Activity" matrix={{ rows: [], cols: [], values: [] }} />);
  await expect(component.getByText("Activity")).toBeVisible();
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});
