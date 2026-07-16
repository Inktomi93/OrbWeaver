// Pure ECharts option builder behind <Scatter> — split out (no React/echarts-for-react import) so it's
// cheaply unit-testable without a mounted instance. Chrome + category colors arrive as concrete resolved
// values (never `var()`/`TOKENS[...].value`), because ECharts paints to Canvas where `var()` can't resolve.
//
// Each point carries an opaque `id` in ECharts' per-datum `value[2]` slot so a click can map the picked
// cell straight back to the caller's entity — <Scatter> reads it off `event.data` and hands it to
// `onPointClick` (that click→id resolution is why this primitive exists: raw SVG scatters can't be made
// interactive under the feature belt).
import type { OrbChartOption } from "../chart/echarts-setup";
import type { ChartColors } from "../chart/use-chart-theme";

export interface ScatterPoint {
  /** Opaque caller id echoed back on click (never rendered). */
  readonly id: string;
  /** Point name — the tooltip + accessible label. */
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface ScatterSeries {
  /** Category name (the legend + tooltip series label). */
  readonly name: string;
  readonly points: readonly ScatterPoint[];
}

const SYMBOL_SIZE_PX = 10;
const SYMBOL_OPACITY = 0.8;

/** ECharts stashes the opaque id at `value[2]`; a click reads it back to resolve the picked entity. On a
 *  click event, `params.data` is the datum AS AUTHORED — here the `{ name, value: [x, y, id] }` object
 *  (below), not a bare tuple — so read the id off `.value[2]`, with a bare-array fallback for safety. */
export function pointId(data: unknown): string | null {
  if (Array.isArray(data) && typeof data[2] === "string") {
    return data[2];
  }
  if (typeof data === "object" && data !== null && "value" in data) {
    const { value } = data as { readonly value: unknown };
    if (Array.isArray(value) && typeof value[2] === "string") {
      return value[2];
    }
  }
  return null;
}

// Series color-by-category rides `ChartColors.palette` (the 5-stop chart ramp) — ui owns the palette,
// so the caller groups points into categories and never touches a color. Beyond 5 categories the ramp
// wraps (rare here; the corpus map caps genres at the ramp length upstream).
export function buildScatterOption(series: readonly ScatterSeries[], colors: ChartColors): OrbChartOption {
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      // params.value is `[x, y, id]`; params.name is the point label (set per-datum below).
      formatter: (params) => (params as { name: string }).name,
    },
    xAxis: { type: "value", show: false, scale: true },
    yAxis: { type: "value", show: false, scale: true },
    series: series.map((cat, index) => ({
      type: "scatter",
      name: cat.name,
      symbolSize: SYMBOL_SIZE_PX,
      itemStyle: { color: colors.palette[index % colors.palette.length] ?? colors.series, opacity: SYMBOL_OPACITY },
      data: cat.points.map((point) => ({ name: point.label, value: [point.x, point.y, point.id] })),
    })),
  };
}
