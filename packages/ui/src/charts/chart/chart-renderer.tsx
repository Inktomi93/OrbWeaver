// ECharts stays behind the chart's lazy boundary; number-only tiles never load its runtime.
import ReactEChartsCoreDefault from "echarts-for-react/lib/core.js";
import type { ReactElement } from "react";
import type { ChartProps } from "./contract.ts";
import { echartsCore } from "./echarts-setup.ts";

// The CJS renderer may arrive as its component or as the module namespace.
type CoreNamespace = typeof ReactEChartsCoreDefault;
type CoreComponent = CoreNamespace extends { readonly default: infer C } ? C : CoreNamespace;
const ReactEChartsCore = ((ReactEChartsCoreDefault as unknown as { readonly default?: CoreComponent }).default ??
  (ReactEChartsCoreDefault as unknown as CoreComponent)) as CoreComponent;

/** Render the already-themed chart after the shared seal's lazy boundary resolves. */
export function ChartRenderer({ option, height, onChartReady, onEvents }: Pick<ChartProps, "option" | "height" | "onChartReady" | "onEvents">): ReactElement {
  return (
    <ReactEChartsCore
      echarts={echartsCore}
      lazyUpdate={true}
      notMerge={true}
      option={option}
      style={{ height, width: "100%" }}
      {...(onChartReady === undefined ? {} : { onChartReady })}
      {...(onEvents === undefined ? {} : { onEvents })}
    />
  );
}
