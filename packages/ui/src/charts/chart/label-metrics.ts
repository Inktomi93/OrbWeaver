// Text measurement for the labels ECharts DRAWS BUT NEVER RESERVES SPACE FOR.
//
// ECharts 6 lays a grid out from `grid.left/right/...` and then shrinks it so the AXIS labels fit inside
// the outer bounds (`outerBoundsContain: 'axisLabel'`). A SERIES label — the value printed at a bar's end —
// is in neither budget: it is drawn wherever the bar ends and clipped by the canvas if it doesn't fit. The
// fixed 64px gutter that used to stand in for that budget clipped "100 tokens" to "100 to" at a 240px mount
// (side-eye ANALYTICS 2026-08-19, P1c). So an option builder that prints a value label must MEASURE it.
//
import type { ChartColors } from "./use-chart-theme.ts";

/** Lazily-created private measuring context; `null` once we know there is no DOM to measure in. */
let measureContext: CanvasRenderingContext2D | null | undefined;

function labelContext(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    measureContext = canvas?.getContext("2d") ?? null;
  }
  return measureContext;
}

/** The rendered width of one chart label, in CSS px, at the pinned font. */
function measureChartLabelPx(text: string, theme: ChartColors): number {
  const context = labelContext();
  if (context === null) {
    // One em per code point is deliberately conservative until the real font can be measured.
    return [...text].length * theme.metrics.fontSize;
  }
  context.font = `${theme.fontWeight} ${theme.metrics.fontSize}px ${theme.fontFamily}`;
  return Math.ceil(context.measureText(text).width);
}

/** The width of the WIDEST of several labels — the gutter a series of them needs. `0` for an empty list. */
export function widestChartLabelPx(texts: readonly string[], theme: ChartColors): number {
  let widest = 0;
  for (const text of texts) {
    const width = measureChartLabelPx(text, theme);
    if (width > widest) {
      widest = width;
    }
  }
  return widest;
}
