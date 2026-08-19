// The ECharts seal — every @orb/ui chart type renders through this ONE wrapper: reduced-motion
// (ECharts animates via canvas-internal timers, not CSS, so this reads prefers-reduced-motion live
// and forces `animation: false`), resize (free via echarts-for-react's size-sensor), and accessible
// name (ECharts' native `aria` component). Colors are never decided here — `option` arrives fully built.
// `.js` is REQUIRED, not cosmetic: the package ships no exports map, so `nodenext` resolves this deep
// subpath by node's own rules and an extensionless ESM specifier is a hard error (tsx-shedding stage 4).
// TS maps the `.js` specifier to the sibling `core.d.ts`; the runtime is vite, which accepts either.
import ReactEChartsCoreDefault from "echarts-for-react/lib/core.js";
import type { ReactElement } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import type { OrbChartOption, OrbEChartsInstance } from "./echarts-setup.ts";
import { echartsCore } from "./echarts-setup.ts";
import { mergeChartOption } from "./merge-option.ts";
import { chartVariants } from "./variants.ts";

// `echarts-for-react/lib/core` is CJS (`exports.default = class`). Some bundler interop paths
// (notably the dev server's ESM<->CJS bridge) hand back the module namespace object
// (`{ default: class }`) rather than the class itself — rendering it throws "Element type is
// invalid… got: object" the moment a populated chart mounts. Unwrap defensively so the value is
// always the component class regardless of which interop path resolved it.
// nodenext (stage 4) types this CJS module as its NAMESPACE (`typeof import(…)`), so the old unwrap —
// which typed `.default` as the namespace again — produced a non-callable JSX type. Infer the component
// out of the namespace instead: both interop shapes normalize to the class, and the type follows.
type CoreNamespace = typeof ReactEChartsCoreDefault;
type CoreComponent = CoreNamespace extends { readonly default: infer C } ? C : CoreNamespace;
const ReactEChartsCore = ((ReactEChartsCoreDefault as unknown as { readonly default?: CoreComponent }).default ??
  (ReactEChartsCoreDefault as unknown as CoreComponent)) as CoreComponent;

const DEFAULT_HEIGHT = 240;

/**
 * A PERCENTAGE HEIGHT IS THE WRAPPER'S JOB (side-eye corpus re-pass #3, P2-A).
 *
 * `style={{ height }}` on the ECharts div alone is correct for a LENGTH and silently dead for a PERCENTAGE:
 * the wrapper is `height: auto`, and a percentage height against an auto-height parent computes to `auto`,
 * so echarts fell back to its own 100px floor. Measured: `height="100%"` drew a 100px canvas in a 693px
 * panel (the semantic map), and the wrapper stayed tall the whole time — which is why the caller's own
 * dead-space test could not see it. A primitive prop that cannot work is the defect, so the fix is here and
 * every future percentage caller inherits it.
 *
 * A PERCENTAGE HERE MEANS "FILL THE HOST BOX", which is the only percentage a chart in this family can
 * honour: every one of them is mounted in `LabeledChartFrame`'s flex column beside a heading (and sometimes
 * a key), so the wrapper takes the space those leave (`flex-1`) rather than a fraction of the whole frame —
 * a literal `height: 50%` there would shrink the heading and clip the key instead. `100%` is the one
 * percentage any caller passes; a length passes through untouched.
 */
function isPercentHeight(height: number | string): boolean {
  return typeof height === "string" && height.trim().endsWith("%");
}

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
  const fill = isPercentHeight(height);
  const slots = chartVariants({ fill });
  const merged = mergeChartOption(option, { label, reducedMotion });

  return (
    <div className={cn(slots.root(), className)} data-slot="chart">
      <ReactEChartsCore
        echarts={echartsCore}
        lazyUpdate={true}
        notMerge={true}
        option={merged}
        // A percentage now resolves against the wrapper, which the `fill` variant just gave a definite
        // height; a length still lands here, exactly as before.
        style={{ height: fill ? "100%" : height, width: "100%" }}
        // echarts-for-react's own prop type omits `| undefined` (exactOptionalPropertyTypes), so an
        // absent callback must be OMITTED rather than passed as an explicit `undefined` value.
        {...(onChartReady === undefined ? {} : { onChartReady })}
        {...(onEvents === undefined ? {} : { onEvents })}
      />
    </div>
  );
}
