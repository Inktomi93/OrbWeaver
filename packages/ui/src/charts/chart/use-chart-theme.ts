// useChartTheme — the §11.3 canvas-token resolver. ECharts renders to a Canvas, where `var(--token)`
// does NOT resolve (unlike nivo's SVG), so the chart CHROME colors (axis labels, grid lines, the
// bar/line palette) can't be handed to ECharts as `var(--color-…)` strings — they must be CONCRETE
// values. This hook resolves each DTCG chrome token to its live computed value via `getComputedStyle`
// on the document root (where the shell stamps `[data-theme]`, and where the `--color-*` cascade
// originates), and RE-READS on theme switch via a MutationObserver on the root's `data-theme`
// attribute — so a Light↔Dark flip repaints the chart chrome instead of baking a stale static literal
// (the near-white-on-near-white axis-label defect §11.3 exists to prevent).
//
// The static `TOKENS[key].value` is the FALLBACK, used verbatim when there's no live root to read
// (SSR / non-browser test runners) or when the var resolves empty (var not yet applied) — so the
// pure option builders and their unit tests still have a deterministic concrete color off-DOM.
import { useSyncExternalStore } from "react";
import { TOKENS } from "#tokens";

// DOM access rides `globalThis` with self-contained structural types (the view-transition.ts
// pattern): the node typecheck lane follows the lib barrel into this file and has no `dom` lib. The
// root element, `getComputedStyle`, and `MutationObserver` are all carried as minimal local shapes —
// browser reality is unchanged, only the types live here.
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

// Cast via `unknown`: with the `dom` lib present (the @orb/ui package build), the ambient
// `globalThis` shapes for `getComputedStyle`/`MutationObserver` don't structurally overlap these
// minimal locals, so a direct assertion is rejected (TS2352) — the intent is deliberate.
const chartGlobals = globalThis as unknown as ChartThemeGlobals;

// The chrome tokens the v1 chart family paints onto canvas: the bar/line/area fill, category/value
// axis labels, and axis/grid lines. Keyed by ROLE (not token name) so an option builder asks for
// what it's styling, not which token backs it.
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

// Resolve one token: the live computed `var()` value off the root, else the static literal. A root
// present but the var unset (`getPropertyValue` returns "") also falls back — an empty string is not
// a paintable color.
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

// The static all-fallback snapshot: identity-stable, so `useSyncExternalStore`'s server/no-DOM
// snapshot never spins a fresh object per render (a new `{}` would loop `useSyncExternalStore`).
const FALLBACK_COLORS: ChartColors = {
  series: CHROME_TOKENS.series.value,
  axisLabel: CHROME_TOKENS.axisLabel.value,
  axisLabelMuted: CHROME_TOKENS.axisLabelMuted.value,
  axisLine: CHROME_TOKENS.axisLine.value,
};

// A single cached snapshot re-derived only when the store notifies — `useSyncExternalStore` demands a
// referentially-stable `getSnapshot` between notifications (returning a fresh object every call would
// loop). Re-read once per theme flip, then serve the cached object until the next flip.
let cachedColors: ChartColors | null = null;

// Shared no-op unsubscribe for the off-DOM path (no observer to tear down).
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

// Watch the root's `data-theme` attribute — the shell stamps a seed palette's `[data-theme=…]` block
// there (app-shell `use-appearance-root-effects`), and that block is what redefines the `--color-*`
// set a theme switch changes. On any flip, drop the cache and notify so the next `getSnapshot`
// re-resolves against the new cascade.
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

/**
 * Live, theme-reactive concrete chart-chrome colors for canvas ECharts (§11.3). Resolves the DTCG
 * chrome tokens via `getComputedStyle` on the document root and re-reads on `data-theme` switch;
 * degrades to the static token literals off-DOM (SSR / non-browser test runners).
 */
export function useChartTheme(): ChartColors {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
