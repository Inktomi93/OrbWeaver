// Unit: <BarList>'s pure `buildBarListOption` builder (ui-package-design §9 v1 corpus-viz set). A
// mounted ECharts instance does not survive the Playwright component-test RPC boundary with its
// methods intact, so the TOKENS-color/rank-order/valueFormatter wiring is proven here as plain data
// (bar-list.ct.tsx covers what IS DOM-observable: heading, chart mount, empty state).
import { buildBarListOption } from "../../../../packages/ui/src/charts/bar-list/option.ts";
import { TOKENS } from "../../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../../support/fixtures";

const ITEMS = [
  { id: "a", label: "Handbook", value: 42 },
  { id: "b", label: "Onboarding guide", value: 30 },
  { id: "c", label: "FAQ", value: 12 },
];

function identityFormatter(value: number): string {
  return String(value);
}

test("bars use the chart-1 TOKENS color, never a raw literal", () => {
  const option = buildBarListOption(ITEMS, identityFormatter);
  const series = option.series as { itemStyle: { color: string } }[];
  expect(series[0]?.itemStyle.color).toBe(TOKENS["color.chart-1"].value);
});

test("array order is the rank — item 0 is the first category (top row)", () => {
  const option = buildBarListOption(ITEMS, identityFormatter);
  const yAxis = option.yAxis as { data: string[]; inverse: boolean };
  expect(yAxis.data).toEqual(["Handbook", "Onboarding guide", "FAQ"]);
  expect(yAxis.inverse).toBe(true);
});

test("valueFormatter drives both the tooltip and the bar-end label", () => {
  const option = buildBarListOption(ITEMS, (value) => `${value} chunks`);
  const series = option.series as {
    label: { formatter: (params: { value: number }) => string };
  }[];
  const tooltip = option.tooltip as { valueFormatter: (value: unknown) => string };
  expect(series[0]?.label.formatter({ value: 42 })).toBe("42 chunks");
  expect(tooltip.valueFormatter(42)).toBe("42 chunks");
});
