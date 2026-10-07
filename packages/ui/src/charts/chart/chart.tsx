// The shared chart seal applies reduced motion and accessible names before loading ECharts.
// Its renderer stays lazy so number-only metric tiles never load the chart runtime.
import type { ReactElement } from "react";
import { lazy, Suspense } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { WebSpinner } from "#primitives/spinner";
import type { ChartProps } from "./contract.ts";
import { mergeChartOption } from "./merge-option.ts";
import { chartVariants } from "./variants.ts";

// One boundary covers every chart consumer, including statically imported metric tiles.
const ChartRenderer = lazy(async () => {
  const mod = await import("./chart-renderer.tsx");
  return { default: mod.ChartRenderer };
});

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

/** Apply shared chart policy while retaining the host geometry during renderer loading. */
export function Chart({ option, label, height = DEFAULT_HEIGHT, className, onChartReady, onEvents }: ChartProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const fill = isPercentHeight(height);
  const slots = chartVariants({ fill });
  const merged = mergeChartOption(option, { label, reducedMotion });

  return (
    <div className={cn(slots.root(), className)} data-slot="chart">
      <Suspense
        fallback={
          <div className={slots.loading()} data-slot="chart-loading" style={{ height: fill ? "100%" : height, width: "100%" }}>
            <WebSpinner label={`Loading ${label}`} size="lg" />
          </div>
        }
      >
        <ChartRenderer height={fill ? "100%" : height} onChartReady={onChartReady} onEvents={onEvents} option={merged} />
      </Suspense>
    </div>
  );
}
