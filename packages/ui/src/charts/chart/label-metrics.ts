// Text measurement for the labels ECharts DRAWS BUT NEVER RESERVES SPACE FOR.
//
// ECharts 6 lays a grid out from `grid.left/right/...` and then shrinks it so the AXIS labels fit inside
// the outer bounds (`outerBoundsContain: 'axisLabel'`). A SERIES label — the value printed at a bar's end —
// is in neither budget: it is drawn wherever the bar ends and clipped by the canvas if it doesn't fit. The
// fixed 64px gutter that used to stand in for that budget clipped "100 tokens" to "100 to" at a 240px mount
// (side-eye ANALYTICS 2026-08-19, P1c). So an option builder that prints a value label must MEASURE it.
//
// The font is pinned here and applied by the builders to the labels they measure, so the measurement and
// the paint cannot drift: measuring one font while ECharts draws another is a gutter that is silently wrong.
// (The values ARE ECharts' own defaults — `fontSize: 12` / `fontFamily: 'sans-serif'` — so pinning them
// changes no pixel; it only makes the pairing explicit and stable against a vendor default change.)

/** The pinned label font size, in px — applied to every measured label by its option builder. */
export const CHART_LABEL_FONT_SIZE_PX = 12;
/** The pinned label font family — applied to every measured label by its option builder. */
export const CHART_LABEL_FONT_FAMILY = "sans-serif";

const CHART_LABEL_FONT = `${CHART_LABEL_FONT_SIZE_PX}px ${CHART_LABEL_FONT_FAMILY}`;
/** Non-DOM fallback advance per character (SSR / node unit tests). Deliberately WIDE of the truth: an
 *  over-reserved gutter costs a few px of plot, an under-reserved one clips the datum. */
const FALLBACK_CHAR_ADVANCE_PX = 8;

/** Lazily-created private measuring context; `null` once we know there is no DOM to measure in. */
let measureContext: CanvasRenderingContext2D | null | undefined;

function labelContext(): CanvasRenderingContext2D | null {
  if (measureContext === undefined) {
    const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
    measureContext = canvas?.getContext("2d") ?? null;
    if (measureContext !== null) {
      measureContext.font = CHART_LABEL_FONT;
    }
  }
  return measureContext;
}

/** The rendered width of one chart label, in CSS px, at the pinned font. */
function measureChartLabelPx(text: string): number {
  const context = labelContext();
  if (context === null) {
    return text.length * FALLBACK_CHAR_ADVANCE_PX;
  }
  return Math.ceil(context.measureText(text).width);
}

/** The width of the WIDEST of several labels — the gutter a series of them needs. `0` for an empty list. */
export function widestChartLabelPx(texts: readonly string[]): number {
  let widest = 0;
  for (const text of texts) {
    const width = measureChartLabelPx(text);
    if (width > widest) {
      widest = width;
    }
  }
  return widest;
}
