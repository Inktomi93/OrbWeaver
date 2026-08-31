// ECharts renders to Canvas, where `var(--token)` does not resolve — chart chrome colors (axis
// labels, grid lines, palette) must be CONCRETE values. This hook resolves each DTCG chrome token
// through the shared live-token-resolver seam (`#lib`'s `createLiveTokenStore`/`resolveCssVar`) — a
// getComputedStyle read on the app's marked resolution root (`LIVE_TOKEN_ROOT_ATTRIBUTE`, the shell grid a
// chart paints inside — NOT `documentElement`, whose palette a custom theme never touches, #504), re-read
// via the seam's MutationObserver over the three channels that can move a token (the list and its coverage
// audit are the seam's, not this consumer's), so a Light/Dark flip, a colorization flip (#503, which
// re-declares `--color-border` — this hook's `axisLine`) OR a custom-theme flip repaints the chart instead
// of baking a stale literal.
import { useSyncExternalStore } from "react";
import { createLiveTokenStore, resolveCssColor, resolveCssVar } from "#lib";
import { TOKEN_POLARITY_ARMS, TOKENS } from "#tokens";

// Keyed by ROLE (not token name) so an option builder asks for what it's styling, not which token backs it.
export interface ChartColors {
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
} as const satisfies Record<Exclude<keyof ChartColors, "palette">, { readonly cssVar: string; readonly value: string }>;

function resolveRamp(resolve: (token: { readonly cssVar: string; readonly value: string }) => string): ChartColors["palette"] {
  return [resolve(RAMP_TOKENS[0]), resolve(RAMP_TOKENS[1]), resolve(RAMP_TOKENS[2]), resolve(RAMP_TOKENS[3]), resolve(RAMP_TOKENS[4])];
}

function resolveColor(token: { readonly cssVar: string; readonly value: string }): string {
  return resolveCssVar(token.cssVar, token.value);
}

function resolveChartColors(): ChartColors {
  return {
    // Chart tokens are polarity-aware too: Canvas needs the cascade-resolved concrete arm, never the
    // raw light-dark() token stream returned by getPropertyValue.
    series: resolveCssColor(CHROME_TOKENS.series.cssVar, CHROME_TOKENS.series.value),
    // Through the CASCADE, not through the custom property: these two are `light-dark()` tokens (D71), and
    // a raw `getPropertyValue` hands back the literal `light-dark(...)` string, which canvas cannot paint.
    seriesPositive: resolveCssColor(CHROME_TOKENS.seriesPositive.cssVar, CHROME_TOKENS.seriesPositive.value),
    seriesNegative: resolveCssColor(CHROME_TOKENS.seriesNegative.cssVar, CHROME_TOKENS.seriesNegative.value),
    axisLabel: resolveColor(CHROME_TOKENS.axisLabel),
    axisLabelMuted: resolveColor(CHROME_TOKENS.axisLabelMuted),
    axisLine: resolveColor(CHROME_TOKENS.axisLine),
    palette: resolveRamp((token) => resolveCssColor(token.cssVar, token.value)),
  };
}

// Identity-stable, so useSyncExternalStore's server/no-DOM snapshot never spins a fresh object per render.
const FALLBACK_COLORS: ChartColors = {
  series: TOKEN_POLARITY_ARMS["color.chart-1"].dark,
  seriesPositive: TOKEN_POLARITY_ARMS["color.success"].dark,
  seriesNegative: TOKEN_POLARITY_ARMS["color.destructive"].dark,
  axisLabel: CHROME_TOKENS.axisLabel.value,
  axisLabelMuted: CHROME_TOKENS.axisLabelMuted.value,
  axisLine: CHROME_TOKENS.axisLine.value,
  palette: [
    TOKEN_POLARITY_ARMS["color.chart-1"].dark,
    TOKEN_POLARITY_ARMS["color.chart-2"].dark,
    TOKEN_POLARITY_ARMS["color.chart-3"].dark,
    TOKEN_POLARITY_ARMS["color.chart-4"].dark,
    TOKEN_POLARITY_ARMS["color.chart-5"].dark,
  ],
};

const chartThemeStore = createLiveTokenStore(resolveChartColors, FALLBACK_COLORS);

/** Live, theme-reactive concrete chart-chrome colors for canvas ECharts. */
export function useChartTheme(): ChartColors {
  return useSyncExternalStore(chartThemeStore.subscribe, chartThemeStore.getSnapshot, chartThemeStore.getServerSnapshot);
}
