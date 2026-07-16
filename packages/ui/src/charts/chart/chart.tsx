// The ECharts seal — every @orb/ui chart type renders through this ONE wrapper: reduced-motion
// (ECharts animates via canvas-internal timers, not CSS, so this reads prefers-reduced-motion live
// and forces `animation: false`), resize (free via echarts-for-react's size-sensor), and accessible
// name (ECharts' native `aria` component). Colors are never decided here — `option` arrives fully built.
import ReactEChartsCoreDefault from "echarts-for-react/lib/core";
import type { ReactElement } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import type { OrbChartOption, OrbEChartsInstance } from "./echarts-setup";
import { echartsCore } from "./echarts-setup";
import { mergeChartOption } from "./merge-option";
import { chartVariants } from "./variants";

// `echarts-for-react/lib/core` is CJS (`exports.default = class`). Some bundler interop paths
// (notably the dev server's ESM<->CJS bridge) hand back the module namespace object
// (`{ default: class }`) rather than the class itself — rendering it throws "Element type is
// invalid… got: object" the moment a populated chart mounts. Unwrap defensively so the value is
// always the component class regardless of which interop path resolved it.
const ReactEChartsCore = (ReactEChartsCoreDefault as unknown as { readonly default?: typeof ReactEChartsCoreDefault }).default ?? ReactEChartsCoreDefault;

const DEFAULT_HEIGHT = 240;

/** One ECharts mouse event — the fields interactive charts read (the clicked datum's series + data). */
export interface ChartEvent {
  readonly seriesIndex?: number;
  readonly dataIndex?: number;
  readonly data?: unknown;
}

export interface ChartProps {
  readonly option: OrbChartOption;
  /** Accessible name for the canvas, rendered via ECharts' `aria` component. */
  readonly label: string;
  readonly height?: number | string;
  readonly className?: string;
  /** Escape hatch for callers/tests that need the live instance. */
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
  /** ECharts event handlers, keyed by event name (`"click"` for point/cell selection). */
  readonly onEvents?: Readonly<Record<string, (event: ChartEvent) => void>> | undefined;
}

export function Chart({ option, label, height = DEFAULT_HEIGHT, className, onChartReady, onEvents }: ChartProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const slots = chartVariants();
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
        {...(onEvents === undefined ? {} : { onEvents })}
      />
    </div>
  );
}
