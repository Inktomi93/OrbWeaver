// Unit: <Chart>'s pure option-merge logic. A mounted
// ECharts instance does not survive the Playwright component-test RPC boundary with its methods
// intact, so the reduced-motion/aria wiring is proven here as plain data transformation instead of
// through a live instance (chart.ct.tsx covers what IS DOM-observable: rendering + resize).
import { mergeChartOption } from "../../../../packages/ui/src/charts/chart/merge-option.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("reduced motion forces animation off, even when the option requests it on", () => {
  const merged = mergeChartOption({ series: [{ type: "bar", data: [1] }], animation: true }, { label: "Widget", reducedMotion: true });
  expect(merged.animation).toBe(false);
});

test("without reduced motion, animation defaults on when the option doesn't say", () => {
  const merged = mergeChartOption({ series: [{ type: "bar", data: [1] }] }, { label: "Widget", reducedMotion: false });
  expect(merged.animation).toBe(true);
});

test("without reduced motion, an explicit animation: false is still honored", () => {
  const merged = mergeChartOption({ series: [{ type: "bar", data: [1] }], animation: false }, { label: "Widget", reducedMotion: false });
  expect(merged.animation).toBe(false);
});

test("the native aria label defaults to the given label", () => {
  const merged = mergeChartOption({ series: [{ type: "bar", data: [1] }] }, { label: "Widget usage", reducedMotion: false });
  expect(merged.aria).toMatchObject({ enabled: true, label: { description: "Widget usage" } });
});

test("a caller-supplied aria block overrides the default entirely", () => {
  const merged = mergeChartOption({ series: [{ type: "bar", data: [1] }], aria: { enabled: false } }, { label: "Widget usage", reducedMotion: false });
  expect(merged.aria).toEqual({ enabled: false });
});
