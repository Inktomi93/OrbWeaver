// The ONE echarts registration site — every chart imports its runtime pieces from here, never
// `echarts/core`/`charts`/`components`/`renderers` directly. Types are a deliberate exception: the
// tree-shaken `echarts/components` module doesn't export axis option types, so we type against the
// full package's `EChartsOption` via `import type` (erased at compile time, zero runtime cost).
import { BarChart, LineChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, TooltipComponent } from "echarts/components";
// Aliased so react-hooks/rules-of-hooks doesn't misread the top-level call as React's `use()` hook.
import { dispose, getInstanceByDom, init, use as registerModules } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

export type { EChartsOption as OrbChartOption } from "echarts";
export type { ECharts as OrbEChartsInstance } from "echarts/core";

registerModules([BarChart, LineChart, GridComponent, TooltipComponent, DatasetComponent, AriaComponent, CanvasRenderer]);

/** The exact surface `echarts-for-react/lib/core` calls on its `echarts` prop. */
export const echartsCore = { init, dispose, getInstanceByDom };
