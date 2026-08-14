// ECharts renders to Canvas, where `var(--token)` does not resolve — chart chrome colors (axis
// labels, grid lines, palette) must be CONCRETE values. This hook resolves each DTCG chrome token
// through the shared live-token-resolver seam (`#lib`'s `createLiveTokenStore`/`resolveCssVar`) — a
// getComputedStyle read on the document root, re-read on theme switch via a MutationObserver on
// `data-theme`, so a Light/Dark flip repaints the chart instead of baking a stale literal.
import { useSyncExternalStore } from "react";
import { createLiveTokenStore, resolveCssVar } from "#lib";
import { TOKENS } from "#tokens";

const THEME_ATTRIBUTE_FILTER = ["data-theme"];

// Keyed by ROLE (not token name) so an option builder asks for what it's styling, not which token backs it.
export interface ChartColors {
  /** Series fill — bars, the sparkline line + area. */
  readonly series: string;
  /** Primary axis text (category labels on a bar-list y-axis). */
  readonly axisLabel: string;
  /** Secondary axis text (value labels, histogram tick labels). */
  readonly axisLabelMuted: string;
  /** Axis lines + grid split lines. */
  readonly axisLine: string;
  /** The 5-stop categorical ramp (`color.chart-1..5`) — scatter series color-by-category; the heatmap's
   * VisualMap uses stop 0 as its high-intensity end. All resolve live, so a custom theme retints them. */
  readonly palette: readonly [string, string, string, string, string];
}

const RAMP_TOKENS = [TOKENS["color.chart-1"], TOKENS["color.chart-2"], TOKENS["color.chart-3"], TOKENS["color.chart-4"], TOKENS["color.chart-5"]] as const;

const CHROME_TOKENS = {
  series: TOKENS["color.chart-1"],
  axisLabel: TOKENS["color.foreground"],
  axisLabelMuted: TOKENS["color.muted-foreground"],
  axisLine: TOKENS["color.border"],
} as const satisfies Record<Exclude<keyof ChartColors, "palette">, { readonly cssVar: string; readonly value: string }>;

function resolveRamp(resolve: (token: { readonly cssVar: string; readonly value: string }) => string): ChartColors["palette"] {
  return [resolve(RAMP_TOKENS[0]), resolve(RAMP_TOKENS[1]), resolve(RAMP_TOKENS[2]), resolve(RAMP_TOKENS[3]), resolve(RAMP_TOKENS[4])];
}

function resolveColor(token: { readonly cssVar: string; readonly value: string }): string {
  return resolveCssVar(token.cssVar, token.value);
}

function resolveChartColors(): ChartColors {
  return {
    series: resolveColor(CHROME_TOKENS.series),
    axisLabel: resolveColor(CHROME_TOKENS.axisLabel),
    axisLabelMuted: resolveColor(CHROME_TOKENS.axisLabelMuted),
    axisLine: resolveColor(CHROME_TOKENS.axisLine),
    palette: resolveRamp(resolveColor),
  };
}

// Identity-stable, so useSyncExternalStore's server/no-DOM snapshot never spins a fresh object per render.
const FALLBACK_COLORS: ChartColors = {
  series: CHROME_TOKENS.series.value,
  axisLabel: CHROME_TOKENS.axisLabel.value,
  axisLabelMuted: CHROME_TOKENS.axisLabelMuted.value,
  axisLine: CHROME_TOKENS.axisLine.value,
  palette: resolveRamp((token) => token.value),
};

const chartThemeStore = createLiveTokenStore(resolveChartColors, FALLBACK_COLORS, THEME_ATTRIBUTE_FILTER);

/** Live, theme-reactive concrete chart-chrome colors for canvas ECharts. */
export function useChartTheme(): ChartColors {
  return useSyncExternalStore(chartThemeStore.subscribe, chartThemeStore.getSnapshot, chartThemeStore.getServerSnapshot);
}
