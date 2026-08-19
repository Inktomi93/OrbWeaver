// Framebuffer readout for the ECharts canvas family (@orb/ui/charts). A canvas chart exposes NOTHING to
// the DOM — no element per bar, no computed style per label — so every geometry claim about a chart
// (a clipped value label, a squeezed plot, two series that are the same colour) has to be read out of the
// PIXELS. `getImageData` runs in the page, and only the per-column summary crosses the RPC boundary.
//
// Two facts this encodes so callers don't re-derive them:
//   • the backing store is `devicePixelRatio`-scaled, so every number here is BACKING-STORE px and the
//     `dpr` comes back with it — never compare a bounding-box px against a column index without it;
//   • an ECharts canvas is transparent where nothing is drawn, so `alpha > 0` IS "ink" — no background
//     colour heuristic, and no `rgb(...)` regex (this tree's tokens are `oklch`, which no such regex sees).
import type { Locator } from "@playwright/test";

export interface CanvasBandInk {
  /** Backing-store width in device px (`canvas.width`, NOT the CSS box). */
  readonly widthPx: number;
  /** Backing-store height of the sampled band, in device px. */
  readonly bandHeightPx: number;
  readonly dpr: number;
  /** Ink (alpha > 0) pixel count for each backing-store column, left → right. Length === `widthPx`. */
  readonly columnInk: readonly number[];
  /** The most frequent fully-opaque `r,g,b` in the band — a solid bar's fill, or "" if the band is empty. */
  readonly dominantColor: string;
}

/**
 * Reads one horizontal band of a chart canvas. `topFraction`/`bottomFraction` are fractions of the canvas
 * height (0 = top): pass a narrow band through the middle of a bar row to isolate that bar's ink from the
 * axis text above and below it.
 */
export function readCanvasBandInk(canvas: Locator, topFraction: number, bottomFraction: number): Promise<CanvasBandInk> {
  return canvas.evaluate(
    (element, [top, bottom]: readonly [number, number]): CanvasBandInk => {
      const node = element as HTMLCanvasElement;
      const context = node.getContext("2d");
      if (context === null) {
        throw new Error("readCanvasBandInk: the canvas has no 2d context");
      }
      const y0 = Math.floor(node.height * top);
      const bandHeightPx = Math.max(1, Math.ceil(node.height * bottom) - y0);
      const { data } = context.getImageData(0, y0, node.width, bandHeightPx);
      const columnInk = new Array<number>(node.width).fill(0);
      const tally = new Map<string, number>();
      const record = (index: number): void => {
        const offset = index * 4;
        const alpha = data[offset + 3] ?? 0;
        if (alpha === 0) {
          return;
        }
        const column = index % node.width;
        columnInk[column] = (columnInk[column] ?? 0) + 1;
        if (alpha === 255) {
          const key = `${data[offset] ?? 0},${data[offset + 1] ?? 0},${data[offset + 2] ?? 0}`;
          tally.set(key, (tally.get(key) ?? 0) + 1);
        }
      };
      for (let index = 0; index < data.length / 4; index++) {
        record(index);
      }
      const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1]);
      return { widthPx: node.width, bandHeightPx, dpr: globalThis.devicePixelRatio, columnInk, dominantColor: ranked[0]?.[0] ?? "" };
    },
    [topFraction, bottomFraction] as const,
  );
}

/**
 * The columns a SOLID horizontal bar occupies: those whose ink fills (nearly) the whole sampled band.
 * Axis/value TEXT in the same band is sparse by construction (glyph strokes leave gaps), so a near-full
 * column is the bar and only the bar.
 */
export function solidColumns(band: CanvasBandInk, fillRatio = 0.9): readonly number[] {
  const floor = band.bandHeightPx * fillRatio;
  const columns: number[] = [];
  band.columnInk.forEach((ink, column) => {
    if (ink >= floor) {
      columns.push(column);
    }
  });
  return columns;
}

/** The rightmost backing-store column carrying ANY ink, or -1 when the band is blank. */
export function lastInkColumn(band: CanvasBandInk): number {
  for (let column = band.columnInk.length - 1; column >= 0; column--) {
    if ((band.columnInk[column] ?? 0) > 0) {
      return column;
    }
  }
  return -1;
}
