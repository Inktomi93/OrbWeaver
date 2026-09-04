// db/kit/insert-chunk — the libSQL bound-variable cap made safe. The chunker sits on every bulk-insert
// path (discovery, stats rollups), so its failure mode matters more than its happy path: a size it cannot
// compute used to produce ONE EMPTY CHUNK, which reads to a caller as "there was nothing to insert" and
// silently drops a non-empty batch (#1377 item 1).

import { chunkRows, rowsPerInsert } from "@orb/db/kit";
import { expect, test } from "../../support/fixtures.ts";

const ROWS = [1, 2, 3, 4, 5];

test("rowsPerInsert floors the per-statement row count against the 32766 bound-variable cap", () => {
  expect(rowsPerInsert(1)).toBe(32_766);
  expect(rowsPerInsert(3)).toBe(10_922); // floor(32766 / 3)
  // A row wider than the whole cap still gets one row per statement rather than zero.
  expect(rowsPerInsert(40_000)).toBe(1);
});

test("chunkRows partitions losslessly, in order, with no empty chunk", () => {
  const chunks = chunkRows(ROWS, 32_766 / 2); // 2 rows per insert
  expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunks.flat()).toEqual(ROWS);
});

test("an EMPTY input yields no chunks at all (never one empty chunk)", () => {
  expect(chunkRows([], 4)).toEqual([]);
});

// The defect: `Math.max(1, NaN)` is NaN, so the loop body ran once (`rows.slice(0, NaN)` → `[]`) and then
// `start += NaN` made the condition false forever. A caller iterating the result inserted NOTHING and got
// no error. A size the helper cannot compute is a caller bug, and it belongs loud at this boundary.
test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 2.5])("columnsPerRow %s is REFUSED, never silently emptied", (columns) => {
  expect(() => rowsPerInsert(columns)).toThrow(RangeError);
  expect(() => chunkRows(ROWS, columns)).toThrow(RangeError);
});
