// How an equal-cell toggle strip lays out its cells: whether a word was cut across two lines, how many rows the cells took, and how far
// any cell reaches past the strip. Read from the page's own layout.
import type { Locator } from "@playwright/test";
import { lineStarts } from "./line-breaks.ts";

interface ToggleStripLayout {
  /** Cells, in order, and the number of words each one cut across two lines. */
  readonly cutWords: readonly number[];
  /** Distinct rows the cells sit on. */
  readonly rows: number;
  /** The furthest any cell's inline end lies past the strip's, in px; 0 when every cell is inside. */
  readonly pastStrip: number;
  /** Each cell's inline size, grouped by row, in px. */
  readonly widthsByRow: readonly (readonly number[])[];
}

/** Read the layout of the cells of `strip`, a `ToggleGroup`, wherever its Toggles sit. */
export async function toggleStripLayout(strip: Locator): Promise<ToggleStripLayout> {
  const cells = strip.locator('[data-slot="toggle"]');
  const count = await cells.count();
  const cutWords: number[] = [];
  for (let index = 0; index < count; index++) {
    const cell = cells.nth(index);
    const starts = await cell.evaluate(lineStarts);
    const label = (await cell.textContent()) ?? "";
    // A line that starts on a letter after a letter is a word cut in two. The browser puts the space a line breaks at on the new line, so a
    // line that starts on that space is the break between words.
    cutWords.push(starts.filter((start) => start.previous.trim() !== "" && (label[start.offset] ?? " ").trim() !== "").length);
  }
  const boxes = await cells.evaluateAll((nodes) => nodes.map((cell) => cell.getBoundingClientRect()).map(({ top, width, right }) => ({ top, width, right })));
  const stripBox = await strip.boundingBox();
  const stripEnd = (stripBox?.x ?? 0) + (stripBox?.width ?? 0);
  const rows = Map.groupBy(boxes, (box) => Math.round(box.top));
  return {
    cutWords,
    rows: rows.size,
    pastStrip: Math.max(0, ...boxes.map((box) => box.right - stripEnd)),
    widthsByRow: [...rows.values()].map((row) => row.map((box) => box.width)),
  };
}
