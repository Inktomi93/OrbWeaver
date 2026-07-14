// Unit: <BarList>'s pure `buildBarListOption` builder. A
// mounted ECharts instance does not survive the Playwright component-test RPC boundary with its
// methods intact, so the resolved-color/rank-order/valueFormatter wiring is proven here as plain
// data (bar-list.ct.tsx covers what IS DOM-observable: heading, chart mount, empty state).
//
// §11.3: the builder takes CONCRETE resolved colors (never `TOKENS[...].value`) — <BarList> resolves
// the DTCG tokens to live computed values via `useChartTheme` and passes them in, because ECharts'
// canvas can't resolve `var()`. This test pins the pass-through contract with a fixture palette.
import { buildBarListOption } from "../../../../packages/ui/src/charts/bar-list/option.ts";
import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { expect, test } from "../../../support/fixtures";

const ITEMS = [
  { id: "a", label: "Handbook", value: 42 },
  { id: "b", label: "Onboarding guide", value: 30 },
  { id: "c", label: "FAQ", value: 12 },
];

// Sentinel resolved palette — distinct per role so a mis-wired slot is caught (not the same color
// everywhere). Stands in for what `useChartTheme` resolves off the live root at render time.
const COLORS: ChartColors = {
  series: "rgb(1, 2, 3)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
};

function identityFormatter(value: number): string {
  return String(value);
}

test("chrome slots carry the resolved colors through, never a token literal", () => {
  const option = buildBarListOption(ITEMS, identityFormatter, COLORS);
  const series = option.series as { itemStyle: { color: string }; label: { color: string } }[];
  const yAxis = option.yAxis as { axisLabel: { color: string } };
  expect(series[0]?.itemStyle.color).toBe(COLORS.series);
  expect(series[0]?.label.color).toBe(COLORS.axisLabelMuted);
  expect(yAxis.axisLabel.color).toBe(COLORS.axisLabel);
});

test("array order is the rank — item 0 is the first category (top row)", () => {
  const option = buildBarListOption(ITEMS, identityFormatter, COLORS);
  const yAxis = option.yAxis as { data: string[]; inverse: boolean };
  expect(yAxis.data).toEqual(["Handbook", "Onboarding guide", "FAQ"]);
  expect(yAxis.inverse).toBe(true);
});

test("valueFormatter drives both the tooltip and the bar-end label", () => {
  const option = buildBarListOption(ITEMS, (value) => `${value} chunks`, COLORS);
  const series = option.series as {
    label: { formatter: (params: { value: number }) => string };
  }[];
  const tooltip = option.tooltip as { valueFormatter: (value: unknown) => string };
  expect(series[0]?.label.formatter({ value: 42 })).toBe("42 chunks");
  expect(tooltip.valueFormatter(42)).toBe("42 chunks");
});
