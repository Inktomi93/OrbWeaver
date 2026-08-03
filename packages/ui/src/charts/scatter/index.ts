/**
 * `@orb/ui/scatter` — an interactive 2D scatter over the ECharts seal (ui-package-design §9). Its
 * point-level `onPointClick` is the reason it exists: raw inline-SVG scatters can't carry an
 * interactive role under the feature belt. See scatter.tsx for the API and the click→id contract.
 */

export type { ScatterPoint, ScatterProps, ScatterSeries } from "./scatter.tsx";
export { Scatter } from "./scatter.tsx";
