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
import { middleEllipsisLabel, widestChartLabelPx } from "../chart/label-metrics.ts";
import { AXIS_LABEL_OUTER_BOUNDS, chartTooltipChrome } from "../chart/merge-option.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";

export interface BarListItem {
  readonly id: string;
  /** The whole name: the tooltip and the text equivalent speak it. */
  readonly label: string;
  /** What the axis paints instead of `label`, for a name whose leading part is shared by its neighbours. */
  readonly shortLabel?: string;
  readonly value: number;
}

/** Which series colour a column paints in. `accent` is the default single-series voice; the semantic pair
 *  exists so a RISING/FALLING comparison reads as two things rather than one repeated chart (P1d); `quiet`
 *  is the ACCENT-BUDGET arm.
 *
 *  WHY `quiet` EXISTS (side-eye corpus populated arm 2026-08-23, [P2-3]). `accent` resolves `color.chart-1`,
 *  which IS `color.primary` — the "look here" ink. A tall single-series chart therefore spends the whole
 *  accent budget on a default fill: a framebuffer census of the corpus overview measured 28.69% accent in
 *  its worst 800px viewport against the §14 physics-4 cap of 10%, essentially all of it one bar list. A
 *  chart that is REFERENCE rather than the surface's focal takes the ramp's second stop (`color.chart-2`,
 *  muted teal) instead. Nothing is carried by hue either way — the bar-end value label and the axis name
 *  state the reading for a viewer who sees no colour at all.
 *
 *  Homed as a tuple and DERIVED (`no-inline-union-redecl`), so the `SERIES_COLOR` map below is exhaustive
 *  by construction and a new intent fails `tsc` rather than falling through to a default. */
const BAR_LIST_INTENTS = ["accent", "positive", "negative", "quiet"] as const;
export type BarListIntent = (typeof BAR_LIST_INTENTS)[number];

/** Where a category name gives way when it outgrows its column. `middle` keeps both ends, for names that
 *  differ in their tail (model ids sharing a vendor prefix). */
export type BarListTruncation = "end" | "middle";

export interface BarListLayout {
  /** The chart's measured container width in CSS px. `0` = not measured yet (first paint / no DOM), which
   *  falls back to the fixed floors below rather than to a share of an unknown width. */
  readonly widthPx: number;
  readonly intent: BarListIntent;
  /** A value-axis maximum SHARED with a twin chart, so two columns are on one scale. `undefined` keeps
   *  ECharts' per-chart auto-scale (correct for a lone chart, a lie for a pair). */
  readonly valueMax: number | undefined;
  readonly truncation: BarListTruncation;
}

/** Last-resort ceiling: a pathological formatter must not consume the plot. The tooltip still has the value. */
const MAX_VALUE_GUTTER_SHARE = 0.4;
/** The category column's share of the container — the ellipsis budget for the y-axis names. */
const CATEGORY_LABEL_SHARE = 0.35;

/** The most of the container a middle-ellipsized category column may claim to keep its names apart. */
const DISTINCT_LABEL_SHARE = 0.6;
const MIDDLE_ELLIPSIS = "…";
/** How far the column widens per attempt while a painted name still fits two items. */
const DISTINCT_LABEL_STEP_PX = 8;

/** The ramp stop `quiet` paints in — index 1 (`color.chart-2`, muted teal). Stop 0 IS `colors.series`, so
 *  a `quiet` chart that took it would be the accent arm wearing another name. */
const QUIET_RAMP_STOP = 1;

const SERIES_COLOR: Record<BarListIntent, (colors: ChartColors) => string> = {
  accent: (colors) => colors.series,
  positive: (colors) => colors.seriesPositive,
  negative: (colors) => colors.seriesNegative,
  quiet: (colors) => colors.palette[QUIET_RAMP_STOP],
};

/** The right gutter the bar-end value labels actually need, measured at the font they are drawn in.
 *
 */
function valueGutterPx(labels: readonly string[], widthPx: number, theme: ChartColors): number {
  const needed = widestChartLabelPx(labels, theme) + 2 * theme.metrics.padding;
  const ceiling = widthPx > 0 ? widthPx * MAX_VALUE_GUTTER_SHARE : Number.POSITIVE_INFINITY;
  return Math.round(Math.max(2 * theme.metrics.padding, Math.min(needed, ceiling)));
}

/** The width a category name is ellipsized to — a share of the container, never the name's own length.
 *
 */
function categoryLabelBudgetPx(widthPx: number, theme: ChartColors): number {
  return Math.round(Math.max(widestChartLabelPx(["…"], theme) + 2 * theme.metrics.padding, widthPx * CATEGORY_LABEL_SHARE));
}

/** Whether a painted label could stand for `name`: the name whole, or the name with one stretch replaced by an ellipsis. */
function standsFor(painted: string, name: string): boolean {
  const [head = "", tail, ...extra] = painted.split(MIDDLE_ELLIPSIS);
  if (tail === undefined) {
    return painted === name;
  }
  return extra.length === 0 && head !== "" && name.startsWith(head) && name.endsWith(tail);
}

/** Names that share both ends paint alike once ellipsized in the middle, so the column widens, up to a share of the
 *  container, until no painted label fits two items. Past the cap the labels may still collide; the text equivalent
 *  and the tooltip then carry every whole name. */
function distinctMiddleBudgetPx(items: readonly BarListItem[], basePx: number, widthPx: number, theme: ChartColors): number {
  const ceilingPx = Math.max(basePx, Math.round(widthPx * DISTINCT_LABEL_SHARE));
  for (let budget = basePx; budget < ceilingPx; budget += DISTINCT_LABEL_STEP_PX) {
    const unambiguous = items.every((item) => {
      const painted = middleEllipsisLabel(item.shortLabel ?? item.label, budget, theme);
      return items.filter((other) => standsFor(painted, other.label) || (other.shortLabel !== undefined && standsFor(painted, other.shortLabel))).length === 1;
    });
    if (unambiguous) {
      return budget;
    }
  }
  return ceilingPx;
}

export function buildBarListOption(
  items: readonly BarListItem[],
  valueFormatter: (value: number) => string,
  colors: ChartColors,
  layout: BarListLayout,
): OrbChartOption {
  const valueLabels = items.map((item) => valueFormatter(item.value));
  const baseBudgetPx = categoryLabelBudgetPx(layout.widthPx, colors);
  const labelBudgetPx = layout.truncation === "middle" ? distinctMiddleBudgetPx(items, baseBudgetPx, layout.widthPx, colors) : baseBudgetPx;
  return {
    grid: {
      left: colors.metrics.padding,
      right: valueGutterPx(valueLabels, layout.widthPx, colors),
      top: colors.metrics.tight,
      bottom: colors.metrics.tight,
      ...AXIS_LABEL_OUTER_BOUNDS,
    },
    tooltip: {
      // The item tooltip carries the UNTRUNCATED category name — the only place the full name survives
      // once the axis label is ellipsized to its budget.
      trigger: "item",
      valueFormatter: (value) => valueFormatter(Number(value)),
      ...chartTooltipChrome(colors),
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
        fontFamily: colors.fontFamily,
        fontSize: colors.metrics.fontSize,
        fontWeight: colors.fontWeight,
        lineHeight: colors.metrics.lineHeight,
        // A middle-ellipsized label is already fitted to the budget; ECharts truncating it again at the end
        // (its own measure differs by a pixel) would cut the tail that tells the names apart.
        ...(layout.truncation === "middle" ? {} : { width: labelBudgetPx, overflow: "truncate" as const, ellipsis: "…" }),
        formatter: (name: string, index: number): string => {
          const painted = items[index]?.shortLabel ?? name;
          return layout.truncation === "middle" ? middleEllipsisLabel(painted, labelBudgetPx, colors) : painted;
        },
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: colors.metrics.barHeight,
        data: items.map((item) => item.value),
        itemStyle: { color: SERIES_COLOR[layout.intent](colors), borderRadius: [0, colors.metrics.radius, colors.metrics.radius, 0] },
        label: {
          show: true,
          position: "right",
          color: colors.axisLabelMuted,
          // Pinned to the font `valueGutterPx` measured with — a gutter sized for one font and painted in
          // another is silently wrong.
          fontFamily: colors.fontFamily,
          fontSize: colors.metrics.fontSize,
          fontWeight: colors.fontWeight,
          lineHeight: colors.metrics.lineHeight,
          distance: colors.metrics.padding,
          formatter: (params) => valueFormatter(Number(params.value)),
        },
      },
    ],
  };
}
