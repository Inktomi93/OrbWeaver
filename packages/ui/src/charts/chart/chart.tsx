// <Chart> — the ECharts seal (D52; ui-package-design §9 "charts/" wave). Every @orb/ui chart type
// (bar-list, stat-figure, histogram, and future corpus-viz additions) renders through this ONE
// wrapper so the cross-cutting obligations live in exactly one place:
//   1. reduced-motion — ECharts animates via canvas-internal timers, not CSS transitions, so the
//      globals.css unlayered reduced-motion floor (crossfade-image's mechanism) can't reach it;
//      this component reads `prefers-reduced-motion` live (useSyncExternalStore) and forces
//      `animation: false`, matching log-viewer's JS-side matchMedia precedent for non-CSS motion.
//   2. resize — free via echarts-for-react's size-sensor (ResizeObserver-backed); no hand-rolled
//      observer needed here.
//   3. accessible name — ECharts' native `aria` component (R2/R3: use what the lib ships, never a
//      hand-rolled visually-hidden label) gives the canvas element `role="img"` + a description.
// Colors are NEVER decided here — `option` arrives fully built (chart-type components source their
// palette from `@orb/ui/tokens`); this wrapper is palette-agnostic.
import ReactEChartsCore from "echarts-for-react/lib/core";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";
import { cn } from "#lib";
import type { OrbChartOption, OrbEChartsInstance } from "./echarts-setup";
import { echartsCore } from "./echarts-setup";
import { mergeChartOption } from "./merge-option";
import { chartVariants } from "./variants";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DEFAULT_HEIGHT = 240;

function subscribeReducedMotion(onChange: () => void): () => void {
  const mql = globalThis.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return (): void => mql.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}

export interface ChartProps {
  /** The ECharts option — bar/line series + grid/tooltip/dataset/aria (the v1 chart family). */
  readonly option: OrbChartOption;
  /**
   * Accessible name for the canvas. ECharts' `aria` component turns this into `role="img"` +
   * `aria-label` on the rendered canvas — never a hand-rolled visually-hidden label over it.
   */
  readonly label: string;
  readonly height?: number | string;
  readonly className?: string;
  /** Escape hatch for callers/tests that need the live instance (e.g. reading the merged option). */
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

/**
 * Usage: `<Chart option={{ xAxis: {...}, yAxis: {...}, series: [...] }} label="Top sources" />`.
 */
export function Chart({
  option,
  label,
  height = DEFAULT_HEIGHT,
  className,
  onChartReady,
}: ChartProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const slots = chartVariants();
  // Caller-supplied `option.aria`/`option.animation` are honored — EXCEPT under reduced motion,
  // where `animation: false` is forced and never overridable (the one binding rule here).
  const merged = mergeChartOption(option, { label, reducedMotion });

  return (
    <div className={cn(slots.root(), className)} data-slot="chart">
      <ReactEChartsCore
        echarts={echartsCore}
        lazyUpdate={true}
        notMerge={true}
        option={merged}
        style={{ height, width: "100%" }}
        // echarts-for-react's own prop type omits `| undefined` (exactOptionalPropertyTypes), so an
        // absent callback must be OMITTED rather than passed as an explicit `undefined` value.
        {...(onChartReady === undefined ? {} : { onChartReady })}
      />
    </div>
  );
}
