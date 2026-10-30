// ECharts paints to Canvas, where `var(--token)` does not resolve, and interpolates colors (VisualMap ramps,
// emphasis) through zrender's sRGB-only parser, which reads OKLCH as black. Every governed color therefore
// reaches the renderer as the engine-painted `rgba()` of its cascade value (`resolveCanvasColor`).
import { useSyncExternalStore } from "react";
import { createLiveTokenStore, resolveCanvasColor, resolveCssLength, resolveCssVar } from "#lib";
import { LENGTH_BASE_PX, TOKEN_POLARITY_ARMS, TOKENS } from "#tokens";

const CHART_LENGTHS = {
  fontSize: "text.label",
  lineHeight: "leading.label",
  barHeight: "leading.label-relaxed",
  padding: "spacing.row",
  tight: "spacing.tight",
  radius: "radius.inset",
  stroke: "border-width.control",
  accentStroke: "border-width.accent",
  dot: "size.dot",
  height: "height.chart",
} as const satisfies Record<string, keyof typeof LENGTH_BASE_PX>;

type ChartMetrics = Record<keyof typeof CHART_LENGTHS, number>;

function chartMetrics(resolve: (path: (typeof CHART_LENGTHS)[keyof typeof CHART_LENGTHS]) => number): ChartMetrics {
  return {
    fontSize: resolve(CHART_LENGTHS.fontSize),
    lineHeight: resolve(CHART_LENGTHS.lineHeight),
    barHeight: resolve(CHART_LENGTHS.barHeight),
    padding: resolve(CHART_LENGTHS.padding),
    tight: resolve(CHART_LENGTHS.tight),
    radius: resolve(CHART_LENGTHS.radius),
    stroke: resolve(CHART_LENGTHS.stroke),
    accentStroke: resolve(CHART_LENGTHS.accentStroke),
    dot: resolve(CHART_LENGTHS.dot),
    height: resolve(CHART_LENGTHS.height),
  };
}

// Keyed by ROLE (not token name) so an option builder asks for what it's styling, not which token backs it.
export interface ChartColors {
  readonly metrics: ChartMetrics;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly area: string;
  /** Series fill — bars, the sparkline line + area. */
  readonly series: string;
  /** Series fill for a series the caller reads as a GAIN, and its twin for a LOSS. The semantic-intent
   *  family (`color.success` / `color.destructive`), never the accent: a rising/falling pair drawn in ONE
   *  colour is two auto-scaled charts pretending to be a comparison, and the sign then lives only in a
   *  clippable bar-end label (side-eye ANALYTICS 2026-08-19, P1d). Colour is the REDUNDANT channel here —
   *  the shared value axis and the signed label carry the same fact for a reader who sees neither hue. */
  readonly seriesPositive: string;
  readonly seriesNegative: string;
  /** Primary axis text (category labels on a bar-list y-axis). */
  readonly axisLabel: string;
  /** Secondary axis text (value labels, histogram tick labels). */
  readonly axisLabelMuted: string;
  /** Axis lines + grid split lines. */
  readonly axisLine: string;
  /** Recessed fill behind plotted data — heatmap split-area bands and the legend's inactive track. */
  readonly track: string;
  /** Floating readout surface and its text — the tooltip, and the ring around a legend handle. */
  readonly surface: string;
  readonly surfaceText: string;
  /** The 5-stop categorical ramp (`color.chart-1..5`) — scatter series color-by-category; the heatmap's
   * VisualMap uses stop 0 as its high-intensity end. All resolve live, so a custom theme's derived
   * color-scheme selects the correct arm without retinting the categorical hues. */
  readonly palette: readonly [string, string, string, string, string];
}

const RAMP_TOKENS = [TOKENS["color.chart-1"], TOKENS["color.chart-2"], TOKENS["color.chart-3"], TOKENS["color.chart-4"], TOKENS["color.chart-5"]] as const;

const CHROME_TOKENS = {
  series: TOKENS["color.chart-1"],
  seriesPositive: TOKENS["color.success"],
  seriesNegative: TOKENS["color.destructive"],
  axisLabel: TOKENS["color.foreground"],
  axisLabelMuted: TOKENS["color.muted-foreground"],
  axisLine: TOKENS["color.border"],
  track: TOKENS["color.muted"],
  surface: TOKENS["color.popover"],
  surfaceText: TOKENS["color.popover-foreground"],
} as const;

function resolveRamp(resolve: (token: { readonly cssVar: string; readonly value: string }) => string): ChartColors["palette"] {
  return [resolve(RAMP_TOKENS[0]), resolve(RAMP_TOKENS[1]), resolve(RAMP_TOKENS[2]), resolve(RAMP_TOKENS[3]), resolve(RAMP_TOKENS[4])];
}

function resolveColor(token: { readonly cssVar: string; readonly value: string }): string {
  return resolveCanvasColor(token.cssVar, token.value);
}

function resolveChartColors(): ChartColors {
  return {
    metrics: chartMetrics((path) => resolveCssLength(TOKENS[path].cssVar, LENGTH_BASE_PX[path])),
    fontFamily: resolveCssVar(TOKENS["font.sans"].cssVar, TOKENS["font.sans"].value),
    fontWeight: Number(resolveCssVar(TOKENS["font-weight.medium"].cssVar, TOKENS["font-weight.medium"].value)),
    area: resolveColor(TOKENS["color.accent"]),
    series: resolveColor(CHROME_TOKENS.series),
    seriesPositive: resolveColor(CHROME_TOKENS.seriesPositive),
    seriesNegative: resolveColor(CHROME_TOKENS.seriesNegative),
    axisLabel: resolveColor(CHROME_TOKENS.axisLabel),
    axisLabelMuted: resolveColor(CHROME_TOKENS.axisLabelMuted),
    axisLine: resolveColor(CHROME_TOKENS.axisLine),
    track: resolveColor(CHROME_TOKENS.track),
    surface: resolveColor(CHROME_TOKENS.surface),
    surfaceText: resolveColor(CHROME_TOKENS.surfaceText),
    palette: resolveRamp(resolveColor),
  };
}

// Identity-stable, so useSyncExternalStore's server/no-DOM snapshot never spins a fresh object per render.
const DEFAULT_CHART_THEME: ChartColors = {
  metrics: chartMetrics((path) => LENGTH_BASE_PX[path]),
  fontFamily: TOKENS["font.sans"].value,
  fontWeight: Number(TOKENS["font-weight.medium"].value),
  area: TOKENS["color.accent"].value,
  series: TOKEN_POLARITY_ARMS["color.chart-1"].dark,
  seriesPositive: TOKEN_POLARITY_ARMS["color.success"].dark,
  seriesNegative: TOKEN_POLARITY_ARMS["color.destructive"].dark,
  axisLabel: CHROME_TOKENS.axisLabel.value,
  axisLabelMuted: CHROME_TOKENS.axisLabelMuted.value,
  axisLine: CHROME_TOKENS.axisLine.value,
  track: CHROME_TOKENS.track.value,
  surface: CHROME_TOKENS.surface.value,
  surfaceText: CHROME_TOKENS.surfaceText.value,
  palette: [
    TOKEN_POLARITY_ARMS["color.chart-1"].dark,
    TOKEN_POLARITY_ARMS["color.chart-2"].dark,
    TOKEN_POLARITY_ARMS["color.chart-3"].dark,
    TOKEN_POLARITY_ARMS["color.chart-4"].dark,
    TOKEN_POLARITY_ARMS["color.chart-5"].dark,
  ],
};

const chartThemeStore = createLiveTokenStore(resolveChartColors, DEFAULT_CHART_THEME);

/** Live, theme-reactive concrete chart-chrome colors for canvas ECharts. */
export function useChartTheme(): ChartColors {
  return useSyncExternalStore(chartThemeStore.subscribe, chartThemeStore.getSnapshot, chartThemeStore.getServerSnapshot);
}
