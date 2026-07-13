// ECharts renders to Canvas, where `var(--token)` does not resolve — chart chrome colors (axis
// labels, grid lines, palette) must be CONCRETE values. This hook resolves each DTCG chrome token via
// `getComputedStyle` on the document root and re-reads on theme switch via a MutationObserver on
// `data-theme`, so a Light/Dark flip repaints the chart instead of baking a stale literal.
import { useSyncExternalStore } from "react";
import { TOKENS } from "#tokens";

// DOM access rides `globalThis` with self-contained structural types — the node typecheck lane
// follows the lib barrel into this file and has no `dom` lib.
interface RootElement {
  readonly getPropertyValue?: unknown;
}
interface ComputedStyle {
  readonly getPropertyValue: (property: string) => string;
}
interface ObserverOptions {
  readonly attributes: boolean;
  readonly attributeFilter: string[];
}
interface ChartObserver {
  observe: (target: RootElement, options: ObserverOptions) => void;
  disconnect: () => void;
}
interface ChartThemeGlobals {
  readonly document?: { readonly documentElement?: RootElement };
  readonly getComputedStyle?: (element: RootElement) => ComputedStyle;
  // biome-ignore lint/style/useNamingConvention: platform global name — mirrors real `globalThis`.
  readonly MutationObserver?: new (
    callback: () => void,
  ) => ChartObserver;
}

// Cast via `unknown`: with the `dom` lib present, ambient globalThis shapes don't structurally
// overlap these minimal locals, so a direct assertion is rejected (TS2352).
const chartGlobals = globalThis as unknown as ChartThemeGlobals;

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
}

const CHROME_TOKENS = {
  series: TOKENS["color.chart-1"],
  axisLabel: TOKENS["color.foreground"],
  axisLabelMuted: TOKENS["color.muted-foreground"],
  axisLine: TOKENS["color.border"],
} as const satisfies Record<keyof ChartColors, { readonly cssVar: string; readonly value: string }>;

// A root present but the var unset (getPropertyValue returns "") also falls back — empty isn't paintable.
function resolveColor(token: { readonly cssVar: string; readonly value: string }): string {
  const root = chartGlobals.document?.documentElement;
  if (root === undefined || chartGlobals.getComputedStyle === undefined) {
    return token.value;
  }
  const resolved = chartGlobals.getComputedStyle(root).getPropertyValue(token.cssVar).trim();
  return resolved === "" ? token.value : resolved;
}

function resolveChartColors(): ChartColors {
  return {
    series: resolveColor(CHROME_TOKENS.series),
    axisLabel: resolveColor(CHROME_TOKENS.axisLabel),
    axisLabelMuted: resolveColor(CHROME_TOKENS.axisLabelMuted),
    axisLine: resolveColor(CHROME_TOKENS.axisLine),
  };
}

// Identity-stable, so useSyncExternalStore's server/no-DOM snapshot never spins a fresh object per render.
const FALLBACK_COLORS: ChartColors = {
  series: CHROME_TOKENS.series.value,
  axisLabel: CHROME_TOKENS.axisLabel.value,
  axisLabelMuted: CHROME_TOKENS.axisLabelMuted.value,
  axisLine: CHROME_TOKENS.axisLine.value,
};

// useSyncExternalStore demands a referentially-stable getSnapshot between notifications.
let cachedColors: ChartColors | null = null;

const NO_UNSUBSCRIBE = (): void => undefined;

function getSnapshot(): ChartColors {
  if (chartGlobals.document?.documentElement === undefined) {
    return FALLBACK_COLORS;
  }
  cachedColors ??= resolveChartColors();
  return cachedColors;
}

function getServerSnapshot(): ChartColors {
  return FALLBACK_COLORS;
}

// Drop the cache and notify on any `data-theme` flip so the next getSnapshot re-resolves against the new cascade.
function subscribe(onChange: () => void): () => void {
  const root = chartGlobals.document?.documentElement;
  if (root === undefined || chartGlobals.MutationObserver === undefined) {
    return NO_UNSUBSCRIBE;
  }
  const observer = new chartGlobals.MutationObserver(() => {
    cachedColors = null;
    onChange();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return (): void => observer.disconnect();
}

/** Live, theme-reactive concrete chart-chrome colors for canvas ECharts. */
export function useChartTheme(): ChartColors {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
