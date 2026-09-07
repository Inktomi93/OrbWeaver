// CT: <BarList> — horizontal ranked bars. Covers what's
// genuinely DOM-observable (heading, chart mount, empty state, the generated text equivalent) plus the
// three things only the FRAMEBUFFER can see (a clipped value label, a category label that ate the plot);
// the TOKENS-color/rank-order/valueFormatter/gutter-derivation wiring is asserted on the pure
// `buildBarListOption` builder in bar-list.test.ts — a mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact, so option-object assertions live in a
// plain unit test instead.
//
// The narrow-mount stories come from `_ct-stories.tsx` because a FUNCTION prop (the `valueFormatter`) does
// not survive the CT mount boundary on a NESTED component — see that module's header.
import { BarList } from "@orb/ui/bar-list";
import { expect, test } from "@playwright/experimental-ct-react";
import { lastInkColumn, readCanvasBandInk, solidColumns } from "../../../support/browser/canvas-ink.ts";
import { ClippedValueLabelStory, LongSeriesBarListStory, ShortSeriesBarListStory } from "../_ct-stories.tsx";

const ITEMS = [
  { id: "a", label: "Handbook", value: 42 },
  { id: "b", label: "Onboarding guide", value: 30 },
  { id: "c", label: "FAQ", value: 12 },
];

test("renders the heading and a populated chart canvas for a non-empty item list", async ({ mount }) => {
  const component = await mount(<BarList items={ITEMS} label="Top sources" />);
  await expect(component.getByText("Top sources")).toBeVisible();
  await expect(component.getByRole("img", { name: "Top sources" })).toBeVisible();
  // Regression guard: populated data must actually draw an ECharts canvas — the CJS/ESM interop
  // regression rendered the wrapper as an object and threw before any canvas mounted.
  await expect(component.locator("canvas")).toBeVisible();
});

test("renders the empty state instead of a chart when items is empty", async ({ mount }) => {
  const component = await mount(<BarList items={[]} label="Top sources" />);
  await expect(component.getByText("Top sources")).toBeVisible();
  await expect(component.getByText("No data yet.")).toBeVisible();
  await expect(component.getByRole("img")).toHaveCount(0);
});

// ── P1c: THE LABELS A CANVAS CHART DRAWS BUT NEVER RESERVES SPACE FOR (side-eye ANALYTICS 2026-08-19) ──
// Two clipping faces, ONE story, both reproduced at HEAD before the fix (band 0.2–0.33, 240px host):
//   • the VALUE label — `option.ts` reserved a FIXED 64px right gutter, and ECharts' outer-bounds machinery
//     accounts for AXIS labels only (`outerBoundsContain: 'axisLabel'`), never a series label. Measured at
//     HEAD: `lastInkColumn` = 239 of a 240px canvas — "100 tokens" cut to "100 to" at the canvas edge.
//   • the CATEGORY label — with no truncation budget the y-axis label expands into the plot until ECharts'
//     `outerBoundsClampWidth` (default '25%', echarts.js:45090) stops the shrink, and then the label is
//     CLIPPED at x=0 mid-word. Measured at HEAD: ink in column 0, and the bar started at column 176 of 240
//     (73% of the canvas spent on one name; the bar itself was 22px).
// The receipts are FRAMEBUFFER reads because there is no DOM here: no element per bar, no computed style
// per label. `readCanvasBandInk` samples one horizontal band and returns per-column ink counts.

/** How close to the canvas edge ink may come before the label is, in practice, touching the cut. */
const EDGE_CLEARANCE_PX = 4;
/** The share of the canvas the CATEGORY column may take before the plot stops being a plot. */
const MAX_CATEGORY_COLUMN_SHARE = 0.45;
/** ECharts' size-sensor swallows its first resize and debounces 60ms (#263) — settle before measuring. */
const CANVAS_SETTLE_MS = 400;

test("the bar-end value label is drawn INSIDE the canvas, not clipped by a fixed gutter (P1c)", async ({ mount }) => {
  const component = await mount(<ClippedValueLabelStory />);
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0, { intervals: [50, 100, CANVAS_SETTLE_MS] }).toBeGreaterThan(0);
  await new Promise((resolve) => setTimeout(resolve, CANVAS_SETTLE_MS));

  const band = await readCanvasBandInk(canvas, 0.2, 0.33);
  // The value label is the RIGHTMOST ink in a bar row. If it ends before the canvas does, it is whole.
  expect(lastInkColumn(band)).toBeLessThanOrEqual(band.widthPx - EDGE_CLEARANCE_PX);
});

test("a long category name is truncated to a budget instead of eating the plot (P1c)", async ({ mount }) => {
  const component = await mount(<ClippedValueLabelStory />);
  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, CANVAS_SETTLE_MS));

  const band = await readCanvasBandInk(canvas, 0.2, 0.33);
  // (a) the name is ELLIPSIZED inside its own budget, so nothing is cut off at the canvas's left edge…
  expect(band.columnInk.slice(0, EDGE_CLEARANCE_PX)).toEqual(new Array<number>(EDGE_CLEARANCE_PX).fill(0));
  // (b) …and the plot still starts inside its share of the width. `solidColumns` are the bar's own columns:
  // text is sparse by construction, a filled bar row is not.
  const bar = solidColumns(band);
  expect(bar.length).toBeGreaterThan(0);
  expect(bar[0] ?? band.widthPx).toBeLessThanOrEqual(band.widthPx * MAX_CATEGORY_COLUMN_SHARE);
});

// ── P1e: A CANVAS CHART IS AN SR BLACK BOX UNLESS THE PRIMITIVE GENERATES THE TEXT ────────────────────
// ECharts' native `aria` component names the canvas and stops there — "Rising, image" and not one datum.
// Lighthouse scored 100 on this section precisely because axe cannot see into a canvas either, so the clean
// bill was exactly wrong. Every chart in the family now emits a visually-hidden TABLE carrying the series in
// the caller's own formatting. DELIBERATELY NOT an aria-label sentence (the brief's short-series arm): a
// name assembled from DATA stops matching the chart's own visible heading (WCAG 2.5.3 label-in-name, the
// rule ListRow's `fullTitle` exists for) and turns a stable `getByRole` name into a data-dependent one
// across ten consumers. ONE home, one shape, at every series length.

test("a short series carries its reading as a table, with the canvas keeping its plain name (P1e)", async ({ mount }) => {
  const component = await mount(<ShortSeriesBarListStory />);
  await expect(component.getByRole("img", { name: "Rising" })).toBeVisible();
  const table = component.getByRole("table", { name: "Rising" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("rowheader").first()).toHaveText("Morgatha");
  await expect(table.getByRole("cell").first()).toHaveText("+10");
});

test("a LONG series carries every datum, in rank order, in the caller's formatting (P1e)", async ({ mount }) => {
  const component = await mount(<LongSeriesBarListStory />);
  const table = component.getByRole("table", { name: "Generations by model" });
  await expect(table).toHaveCount(1);
  await expect(table.getByRole("row")).toHaveCount(21);
  await expect(table.getByRole("rowheader").first()).toHaveText("Model 0");
  await expect(table.getByRole("cell").first()).toHaveText("100 tokens");
  await expect(table.getByRole("rowheader").last()).toHaveText("Model 19");
  await expect(table.getByRole("cell").last()).toHaveText("43 tokens");
});
