// The pure option-merge logic behind <Chart> (split out so it's unit-testable without mounting a
// live ECharts instance — CT can't read a mounted instance's methods back across the Playwright
// component-test RPC boundary, so the reduced-motion/aria wiring is proven here instead).
import type { OrbChartOption } from "./echarts-setup";

export interface MergeChartOptionParams {
  readonly label: string;
  readonly reducedMotion: boolean;
}

/**
 * Applies the two non-negotiable-by-caller defaults: the native `aria` label (overridable — a
 * caller's own `option.aria` wins if supplied) and reduced-motion's `animation: false` (NEVER
 * overridable when `reducedMotion` is true; otherwise the caller's `option.animation` is honored,
 * defaulting to `true`).
 */
export function mergeChartOption(
  option: OrbChartOption,
  { label, reducedMotion }: MergeChartOptionParams,
): OrbChartOption {
  return {
    aria: { enabled: true, decal: { show: false }, label: { description: label } },
    ...option,
    animation: reducedMotion ? false : (option.animation ?? true),
  };
}
