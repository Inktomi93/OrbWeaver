// The reader's row across a change in the leading chrome's height. When a caller's regime flips (a text-size change,
// a rotation) the chrome above the rows changes height, `scrollMargin` follows it, and every row re-measures in the same
// pass; virtual-core keeps the row through either change alone but not through both, so the row read before the change
// is put back at the reader's top edge each frame until the rows stop moving.

import type { RefObject } from "react";
import type { RowKey } from "./row-roving.ts";
import { MESSAGE_LIST_ROW_SLOT } from "./row-roving.ts";

/** A row by key and index, and the share of its height above the reader's top edge; negative while it starts below it. */
export interface ReadingRow {
  readonly key: RowKey;
  readonly index: number;
  readonly into: number;
}

// Rows re-measure over a few frames as their text reflows; this many still frames in a row means they are done.
const SETTLED_FRAMES = 6;
// A ceiling, so a row that never settles (a streaming reply) cannot hold the scroll position forever.
const MAX_HOLD_FRAMES = 120;

function mountedRows(scroller: HTMLElement): readonly HTMLElement[] {
  return [...scroller.querySelectorAll<HTMLElement>(`[data-slot="${MESSAGE_LIST_ROW_SLOT}"]`)];
}

/** The row at the scroller's top edge, or null when no row is on screen or the rows are a commit behind the items or the scroll. */
export function readingRowOf(scroller: HTMLElement, { count, keyAt }: LiveRows): ReadingRow | null {
  const edge = scroller.getBoundingClientRect().top;
  const rows = mountedRows(scroller);
  let found: { readonly row: HTMLElement; readonly box: DOMRect } | null = null;
  for (const row of rows) {
    const box = row.getBoundingClientRect();
    if (box.bottom > edge && box.height > 0 && (found === null || box.top < found.box.top)) {
      found = { row, box };
    }
  }
  if (found === null) {
    return null;
  }
  const index = Number(found.row.dataset["index"]);
  if (index >= count) {
    return null;
  }
  // A jump past the window leaves the old rows mounted below the edge for a commit, and the topmost of them is not the
  // reader's. A row with its neighbour mounted above it is only across a gap.
  if (found.box.top > edge && index > 0 && !rows.some((row) => Number(row.dataset["index"]) === index - 1)) {
    return null;
  }
  return { key: keyAt(index), index, into: Math.min(1, (edge - found.box.top) / found.box.height) };
}

/** The list's rows as of its last commit. */
export interface LiveRows {
  readonly count: number;
  readonly keyAt: (index: number) => RowKey;
}

interface HoldOptions {
  readonly scroller: HTMLElement;
  readonly row: ReadingRow;
  /** Read on every frame: a prepend can land during a hold, or in the commit that starts one. */
  readonly rows: RefObject<LiveRows>;
  /** Brings an unmounted row into the window; the next frame finishes the placement. */
  readonly reveal: (index: number) => void;
  /** True while the reader's own hand is on the axis: they win. */
  readonly yieldTo: () => boolean;
  readonly onWrite: (top: number) => void;
  readonly onDone: () => void;
}

/** Holds `row` at the scroller's top edge until the rows settle; returns a cancel. */
export function holdReadingRow({ scroller, row, rows, reveal, yieldTo, onWrite, onDone }: HoldOptions): () => void {
  let frame = 0;
  let still = 0;
  let handle = 0;
  const indexNow = (): number => {
    const { count, keyAt } = rows.current;
    if (row.index < count && keyAt(row.index) === row.key) {
      return row.index;
    }
    for (let index = 0; index < count; index += 1) {
      if (keyAt(index) === row.key) {
        return index;
      }
    }
    return -1;
  };
  const step = (): void => {
    const index = indexNow();
    if (index < 0 || yieldTo()) {
      onDone();
      return;
    }
    const target = scroller.querySelector<HTMLElement>(`[data-slot="${MESSAGE_LIST_ROW_SLOT}"][data-index="${String(index)}"]`);
    if (target === null) {
      reveal(index);
      still = 0;
    } else {
      const box = target.getBoundingClientRect();
      const drift = box.top + row.into * box.height - scroller.getBoundingClientRect().top;
      if (Math.abs(drift) >= 1) {
        scroller.scrollTop += drift;
        onWrite(scroller.scrollTop);
        still = 0;
      } else {
        still += 1;
      }
    }
    frame += 1;
    if (still >= SETTLED_FRAMES || frame >= MAX_HOLD_FRAMES) {
      onDone();
      return;
    }
    handle = requestAnimationFrame(step);
  };
  handle = requestAnimationFrame(step);
  return (): void => cancelAnimationFrame(handle);
}
