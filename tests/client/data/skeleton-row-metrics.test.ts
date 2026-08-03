// `skeletonRowCountFor` — the arithmetic behind the home tile's loading box (side-eye R-1).
//
// The RENDERED half is pinned as geometry in tests/client/features/home/components/home-tile.ct.tsx (the
// skeleton fills the reserved box: no blank tail, no hairline stub). This file pins the MODEL, in node,
// where there is no document to ask — so it exercises the `TOKENS`-literal fallback path, which is also the
// COARSE-pointer arm (`--spacing-control-lg` is 3.5rem there, 2.5rem on a fine pointer). Both arms matter:
// a hard-coded 48px pitch would have been right in the browser these numbers were measured in and wrong on
// a tablet, which is the whole reason this is arithmetic over resolved tokens rather than a literal.

import { skeletonRowCountFor } from "@orb/client/data";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "../../support/fixtures.ts";

const PX_PER_REM = 16;
const FALLBACK = 3;
/** The two boxes the defect was MEASURED on, verbatim from the re-check's `orb:home-tile-box` read. */
const RECENTS_BOX_PX = 349;
const TEMP_CHAT_BOX_PX = 110.890_625;

/** The coarse-pointer geometry the static `TOKENS` literals describe: a row, the gap between rows, and the
 *  block padding above and below the run. Read from the tokens, never written as numbers — if a token moves,
 *  the expectations below move with it instead of going quietly stale. */
const ROW_PX = Number.parseFloat(TOKENS["spacing.control-lg"].value) * PX_PER_REM;
const GAP_PX = Number.parseFloat(TOKENS["spacing.row"].value) * PX_PER_REM;
const PAD_PX = Number.parseFloat(TOKENS["spacing.block"].value) * PX_PER_REM;

/** The height N rows actually occupy — the layout `SkeletonRows` renders, spelled forward. */
function naturalHeight(rows: number): number {
  return 2 * PAD_PX + rows * ROW_PX + (rows - 1) * GAP_PX;
}

test("a box that exactly fits N rows asks for N rows", () => {
  for (const rows of [1, 2, 3, 7, 12]) {
    expect(skeletonRowCountFor(naturalHeight(rows), FALLBACK), `${rows} rows`).toBe(rows);
  }
});

test("the two boxes the defect was measured on stop blanking and stop clipping", () => {
  // The recents tile: 349px reserved against a 3-row skeleton left 189px of blank.
  const recents = skeletonRowCountFor(RECENTS_BOX_PX, FALLBACK);
  expect(recents).toBeGreaterThan(FALLBACK);
  expect(Math.abs(naturalHeight(recents) - RECENTS_BOX_PX), "the painted skeleton lands within half a row of the box").toBeLessThanOrEqual(ROW_PX / 2 + GAP_PX);

  // The temp-chat tile: the box it settled at, sub-pixel and all, whose third bar `overflow: clip` sliced
  // to a 2.9px hairline.
  const tempChat = skeletonRowCountFor(TEMP_CHAT_BOX_PX, FALLBACK);
  expect(tempChat).toBeLessThan(FALLBACK);
  expect(Math.abs(naturalHeight(tempChat) - TEMP_CHAT_BOX_PX)).toBeLessThanOrEqual(ROW_PX / 2 + GAP_PX);
});

test("a box smaller than one row still paints one row — never zero bars", () => {
  expect(skeletonRowCountFor(1, FALLBACK)).toBe(1);
  expect(skeletonRowCountFor(0, FALLBACK)).toBe(1);
});
