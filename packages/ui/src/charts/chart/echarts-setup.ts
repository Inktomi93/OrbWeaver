// The ONE echarts registration site (D52). Every chart in this seal imports its runtime pieces
// from HERE, never `echarts/core`/`echarts/charts`/`echarts/components`/`echarts/renderers`
// directly and never the whole `echarts` package — `use()` runs once at module load, registering
// exactly what the v1 chart family needs: bar + line series, the cartesian grid (which pulls in
// xAxis/yAxis — see below), tooltip, dataset, and the native aria a11y component.
//
// TYPES are a deliberate exception: the tree-shaken `echarts/components` module does NOT export
// `XAXisComponentOption`/`YAXisComponentOption` (verified against the shipped .d.ts — grid.js's
// install() pulls in the axis MODELS as a runtime dependency, but the modular .d.ts entry points
// never re-export their option types, only the full `echarts/index.d.ts` bundle does). `import
// type` is erased at compile time (zero runtime/bundle cost), so we type against the full
// package's `EChartsOption` rather than hand-rolling an incomplete axis type — this is the
// documented echarts+TS tree-shaking pattern, not a seal breach (no runtime `echarts` import).
import { BarChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  DatasetComponent,
  GridComponent,
  TooltipComponent,
} from "echarts/components";
// `use` is echarts' tree-shaking module-registration fn — aliased so react-hooks/rules-of-hooks
// doesn't misread the top-level call as React 19's `use()` hook (name collision, not a real hook).
import { dispose, getInstanceByDom, init, use as registerModules } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

export type { EChartsOption as OrbChartOption } from "echarts";
export type { ECharts as OrbEChartsInstance } from "echarts/core";

registerModules([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  DatasetComponent,
  AriaComponent,
  CanvasRenderer,
]);

/**
 * The exact surface `echarts-for-react/lib/core` calls on its `echarts` prop (init/dispose/
 * getInstanceByDom) — named re-exports, never a namespace import, so tree-shaking sees precisely
 * what's used.
 */
export const echartsCore = { init, dispose, getInstanceByDom };
