// CT: <Histogram> — a distribution chart over pre-binned buckets. Covers what's genuinely
// DOM-observable (heading, chart mount, empty state); the
// TOKENS-color/flush-bar/bucket-order wiring is asserted on the pure `buildHistogramOption` builder
// in histogram.test.ts — see bar-list.ct.tsx's header comment for why.
import { Histogram } from "@orb/ui/histogram";
import { expect, test } from "@playwright/experimental-ct-react";

const BUCKETS = [
  { label: "0–99", count: 12 },
  { label: "100–199", count: 40 },
  { label: "200–299", count: 7 },
];

test("renders the heading and a populated chart canvas for non-empty buckets", async ({ mount }) => {
  const component = await mount(<Histogram buckets={BUCKETS} label="Chunk size distribution" />);
  await expect(component.getByText("Chunk size distribution")).toBeVisible();
  await expect(component.getByRole("img", { name: "Chunk size distribution" })).toBeVisible();
  // Regression guard: populated data must actually draw an ECharts canvas — the CJS/ESM interop
  // regression rendered the wrapper as an object and threw before any canvas mounted.
  await expect(component.locator("canvas")).toBeVisible();
});

test("renders the empty state instead of a chart when buckets is empty", async ({ mount }) => {
  const component = await mount(<Histogram buckets={[]} label="Chunk size distribution" />);
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});
