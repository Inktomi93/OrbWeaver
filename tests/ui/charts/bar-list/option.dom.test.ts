// Unit: <BarList>'s pure `buildBarListOption` builder. A
// mounted ECharts instance does not survive the Playwright component-test RPC boundary with its
// methods intact, so the resolved-color/rank-order/valueFormatter wiring is proven here as plain
// data (bar-list.ct.tsx covers what IS DOM-observable: heading, chart mount, empty state, the text
// equivalent, and the two framebuffer receipts for the label budgets).
//
// §11.3: the builder takes CONCRETE resolved colors (never `TOKENS[...].value`) — <BarList> resolves
// the DTCG tokens to live computed values via `useChartTheme` and passes them in, because ECharts'
// canvas can't resolve `var()`. This test pins the pass-through contract with a fixture palette.
//
// NOTE ON WIDTHS: `measureChartLabelPx` has no canvas in this (node) lane, so it uses its documented
// per-character fallback. These assertions are therefore about the DERIVATION (widest label wins, the
// share/floor/ceiling rules hold), never about a pixel count a browser would agree with.
import type { BarListLayout } from "../../../../packages/ui/src/charts/bar-list/option.ts";
import { buildBarListOption, categoryLabelBudgetPx, valueGutterPx } from "../../../../packages/ui/src/charts/bar-list/option.ts";
import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { expect, test } from "../../../support/fixtures.ts";

const ITEMS = [
  { id: "a", label: "Handbook", value: 42 },
  { id: "b", label: "Onboarding guide", value: 30 },
  { id: "c", label: "FAQ", value: 12 },
];

// Sentinel resolved palette — distinct per role so a mis-wired slot is caught (not the same color
// everywhere). Stands in for what `useChartTheme` resolves off the live root at render time.
const COLORS: ChartColors = {
  series: "rgb(1, 2, 3)",
  seriesPositive: "rgb(13, 14, 15)",
  seriesNegative: "rgb(16, 17, 18)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
  palette: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)"],
};

const HOST_WIDTH_PX = 400;
const LAYOUT: BarListLayout = { widthPx: HOST_WIDTH_PX, intent: "accent", valueMax: undefined };

function identityFormatter(value: number): string {
  return String(value);
}

test("chrome slots carry the resolved colors through, never a token literal", () => {
  const option = buildBarListOption(ITEMS, identityFormatter, COLORS, LAYOUT);
  const series = option.series as { itemStyle: { color: string }; label: { color: string } }[];
  const yAxis = option.yAxis as { axisLabel: { color: string } };
  expect(series[0]?.itemStyle.color).toBe(COLORS.series);
  expect(series[0]?.label.color).toBe(COLORS.axisLabelMuted);
  expect(yAxis.axisLabel.color).toBe(COLORS.axisLabel);
  expect(option.grid).toMatchObject({ outerBoundsMode: "same", outerBoundsContain: "axisLabel" });
  expect(option.grid).not.toHaveProperty("containLabel");
});

test("array order is the rank — item 0 is the first category (top row)", () => {
  const option = buildBarListOption(ITEMS, identityFormatter, COLORS, LAYOUT);
  const yAxis = option.yAxis as { data: string[]; inverse: boolean };
  expect(yAxis.data).toEqual(["Handbook", "Onboarding guide", "FAQ"]);
  expect(yAxis.inverse).toBe(true);
});

test("valueFormatter drives both the tooltip and the bar-end label", () => {
  const option = buildBarListOption(ITEMS, (value) => `${value} chunks`, COLORS, LAYOUT);
  const series = option.series as {
    label: { formatter: (params: { value: number }) => string };
  }[];
  const tooltip = option.tooltip as { valueFormatter: (value: unknown) => string };
  expect(series[0]?.label.formatter({ value: 42 })).toBe("42 chunks");
  expect(tooltip.valueFormatter(42)).toBe("42 chunks");
});

// ── P1c: the two label budgets are DERIVED, never constants ───────────────────────────────────────────

test("the right gutter follows the WIDEST formatted value label, not a fixed constant", () => {
  const narrow = valueGutterPx(["+1"], HOST_WIDTH_PX);
  const wide = valueGutterPx(["+1", "1,234,567 tokens"], HOST_WIDTH_PX);
  expect(wide).toBeGreaterThan(narrow);
  // …and the OPTION moves with the labels it will draw — same items, wider formatter, wider gutter. (Read
  // off the built option rather than re-calling the helper, which would only compare a function to itself.)
  const tight = (buildBarListOption(ITEMS, () => "+1", COLORS, LAYOUT).grid as { right: number }).right;
  const roomy = (buildBarListOption(ITEMS, () => "1,234,567 tokens", COLORS, LAYOUT).grid as { right: number }).right;
  expect(roomy).toBeGreaterThan(tight);
});

test("the gutter keeps a floor when the width is unknown and a ceiling when the label is absurd", () => {
  // widthPx 0 = not measured yet (first paint / no DOM): floors, never a share of an unknown width.
  expect(valueGutterPx([], 0)).toBeGreaterThan(0);
  // A pathological formatter cannot eat the plot — the tooltip still carries the full value.
  const absurd = valueGutterPx(["a".repeat(200)], HOST_WIDTH_PX);
  expect(absurd).toBeLessThanOrEqual(HOST_WIDTH_PX / 2);
});

test("the category column is a SHARE of the container, with a floor when it is unmeasured", () => {
  expect(categoryLabelBudgetPx(1000)).toBeGreaterThan(categoryLabelBudgetPx(400));
  expect(categoryLabelBudgetPx(0)).toBeGreaterThan(0);
  const option = buildBarListOption(ITEMS, identityFormatter, COLORS, LAYOUT);
  const yAxis = option.yAxis as { axisLabel: { width: number; overflow: string; ellipsis: string } };
  // Truncation is what stops the label expanding into the plot AND what stops the canvas cutting it
  // mid-word: an ellipsis is an honest "there is more", a hard clip is not.
  expect(yAxis.axisLabel.width).toBe(categoryLabelBudgetPx(HOST_WIDTH_PX));
  expect(yAxis.axisLabel.overflow).toBe("truncate");
  expect(yAxis.axisLabel.ellipsis).toBe("…");
});

// ── P1d: the comparison controls (shared scale + semantic colour) ─────────────────────────────────────

test("a shared valueMax pins the axis; its absence leaves ECharts' per-chart auto-scale alone", () => {
  const pinned = buildBarListOption(ITEMS, identityFormatter, COLORS, { ...LAYOUT, valueMax: 184 });
  expect((pinned.xAxis as { max?: number }).max).toBe(184);
  expect(buildBarListOption(ITEMS, identityFormatter, COLORS, LAYOUT).xAxis).not.toHaveProperty("max");
});

test("intent selects the SEMANTIC series colour, never the accent", () => {
  const positive = buildBarListOption(ITEMS, identityFormatter, COLORS, { ...LAYOUT, intent: "positive" });
  const negative = buildBarListOption(ITEMS, identityFormatter, COLORS, { ...LAYOUT, intent: "negative" });
  expect((positive.series as { itemStyle: { color: string } }[])[0]?.itemStyle.color).toBe(COLORS.seriesPositive);
  expect((negative.series as { itemStyle: { color: string } }[])[0]?.itemStyle.color).toBe(COLORS.seriesNegative);
});
