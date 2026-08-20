// Pure ECharts option builder behind <BarList> — split out so it's cheaply unit-testable without a
// mounted ECharts instance. Chrome colors arrive as concrete resolved values, never var() literals.
//
// THE TWO LABEL BUDGETS (side-eye ANALYTICS 2026-08-19, P1c). ECharts reserves space for AXIS labels only
// (`outerBoundsContain: 'axisLabel'`); it reserves nothing for a SERIES label, and it truncates nothing by
// default. The old spelling paid for that twice at a 240px mount: a FIXED 64px right gutter cut
// "100 tokens" to "100 to" at the canvas edge, and an untruncated category name expanded left until
// ECharts' own `outerBoundsClampWidth` (default '25%') stopped the shrink — leaving a 22px bar and a name
// clipped mid-word at x=0. So both budgets are DERIVED here: the value gutter from the MEASURED width of
// the widest formatted label, the category column from a share of the container width, with the name
// ellipsized inside it (the untruncated name survives in the tooltip).
import type { OrbChartOption } from "../chart/echarts-setup.ts";
import { AXIS_LABEL_OUTER_BOUNDS } from "../chart/echarts-setup.ts";
import { CHART_LABEL_FONT_FAMILY, CHART_LABEL_FONT_SIZE_PX, widestChartLabelPx } from "../chart/label-metrics.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";

export interface BarListItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

/** Which series colour a column paints in. `accent` is the default single-series voice; the semantic pair
 *  exists so a RISING/FALLING comparison reads as two things rather than one repeated chart (P1d).
 *  Homed as a tuple and DERIVED (`no-inline-union-redecl`), so the `SERIES_COLOR` map below is exhaustive
 *  by construction and a new intent fails `tsc` rather than falling through to a default. */
const BAR_LIST_INTENTS = ["accent", "positive", "negative"] as const;
export type BarListIntent = (typeof BAR_LIST_INTENTS)[number];

export interface BarListLayout {
  /** The chart's measured container width in CSS px. `0` = not measured yet (first paint / no DOM), which
   *  falls back to the fixed floors below rather than to a share of an unknown width. */
  readonly widthPx: number;
  readonly intent: BarListIntent;
  /** A value-axis maximum SHARED with a twin chart, so two columns are on one scale. `undefined` keeps
   *  ECharts' per-chart auto-scale (correct for a lone chart, a lie for a pair). */
  readonly valueMax: number | undefined;
}

const BAR_MAX_WIDTH_PX = 20;
const BAR_BORDER_RADIUS_PX = 4;
const BAR_BORDER_RADIUS = [0, BAR_BORDER_RADIUS_PX, BAR_BORDER_RADIUS_PX, 0];
const GRID_LEFT_PX = 8;
/** ECharts offsets a `position: "right"` label ~5px off the bar end; the rest is breathing room. */
const VALUE_LABEL_GAP_PX = 8;
/** Clearance between the end of the value label and the canvas edge. */
const VALUE_LABEL_EDGE_PAD_PX = 8;
/** Floor for the value gutter when the container width is unknown (or the labels are tiny). */
const MIN_VALUE_GUTTER_PX = 32;
/** Last-resort ceiling: a pathological formatter must not consume the plot. The tooltip still has the value. */
const MAX_VALUE_GUTTER_SHARE = 0.4;
/** The category column's share of the container — the ellipsis budget for the y-axis names. */
const CATEGORY_LABEL_SHARE = 0.35;
/** Floor for that budget when the container width is unknown. */
const MIN_CATEGORY_LABEL_PX = 64;

const SERIES_COLOR: Record<BarListIntent, (colors: ChartColors) => string> = {
  accent: (colors) => colors.series,
  positive: (colors) => colors.seriesPositive,
  negative: (colors) => colors.seriesNegative,
};

/** The right gutter the bar-end value labels actually need, measured at the font they are drawn in.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function valueGutterPx(labels: readonly string[], widthPx: number): number {
  const needed = widestChartLabelPx(labels) + VALUE_LABEL_GAP_PX + VALUE_LABEL_EDGE_PAD_PX;
  const ceiling = widthPx > 0 ? widthPx * MAX_VALUE_GUTTER_SHARE : Number.POSITIVE_INFINITY;
  return Math.round(Math.max(MIN_VALUE_GUTTER_PX, Math.min(needed, ceiling)));
}

/** The width a category name is ellipsized to — a share of the container, never the name's own length.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function categoryLabelBudgetPx(widthPx: number): number {
  return Math.round(Math.max(MIN_CATEGORY_LABEL_PX, widthPx * CATEGORY_LABEL_SHARE));
}

export function buildBarListOption(
  items: readonly BarListItem[],
  valueFormatter: (value: number) => string,
  colors: ChartColors,
  layout: BarListLayout,
): OrbChartOption {
  const valueLabels = items.map((item) => valueFormatter(item.value));
  return {
    grid: {
      left: GRID_LEFT_PX,
      right: valueGutterPx(valueLabels, layout.widthPx),
      top: 4,
      bottom: 4,
      ...AXIS_LABEL_OUTER_BOUNDS,
    },
    tooltip: {
      // The item tooltip carries the UNTRUNCATED category name — the only place the full name survives
      // once the axis label is ellipsized to its budget.
      trigger: "item",
      valueFormatter: (value) => valueFormatter(Number(value)),
    },
    xAxis: { type: "value", show: false, ...(layout.valueMax === undefined ? {} : { max: layout.valueMax }) },
    yAxis: {
      type: "category",
      inverse: true,
      data: items.map((item) => item.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: colors.axisLabel,
        fontFamily: CHART_LABEL_FONT_FAMILY,
        fontSize: CHART_LABEL_FONT_SIZE_PX,
        width: categoryLabelBudgetPx(layout.widthPx),
        overflow: "truncate",
        ellipsis: "…",
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: BAR_MAX_WIDTH_PX,
        data: items.map((item) => item.value),
        itemStyle: { color: SERIES_COLOR[layout.intent](colors), borderRadius: BAR_BORDER_RADIUS },
        label: {
          show: true,
          position: "right",
          color: colors.axisLabelMuted,
          // Pinned to the font `valueGutterPx` measured with — a gutter sized for one font and painted in
          // another is silently wrong.
          fontFamily: CHART_LABEL_FONT_FAMILY,
          fontSize: CHART_LABEL_FONT_SIZE_PX,
          formatter: (params) => valueFormatter(Number(params.value)),
        },
      },
    ],
  };
}
