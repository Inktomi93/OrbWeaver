// Who moved the reader: a clamp from content leaving under a pinned reader is no move of theirs.
// @subject packages/ui/src/primitives/message-list/follow-yield.ts

import { expect, test } from "@orb/testkit/node";
import type { AxisMark } from "#ui/primitives/message-list/follow-yield.ts";
import { movedFromOutside, SCROLL_END_THRESHOLD_PX } from "#ui/primitives/message-list/follow-yield.ts";

const PORT_PX = 646;
// A pinned reader followed a streaming row into its overflow, past the end the list wrote for it.
const PINNED: AxisMark = { top: 952, rowsOnScreen: -908, contentPx: 1752, portPx: PORT_PX, writtenPx: 1563 };

test("a clamp to the rows' written end, when an overflowing row is replaced by a taller one, is no outside move", () => {
  // The browser clamped to the end written at the mark, 1563 less the port. The taller row then landed and was measured,
  // so the written end as it stands now has grown with the content.
  const clamped: AxisMark = { top: 917, rowsOnScreen: -873, contentPx: 1804, portPx: PORT_PX, writtenPx: 1804 };

  expect(movedFromOutside(PINNED, clamped)).toBe(false);
});

test("a move up off every end is an outside move", () => {
  const top = PINNED.top - PORT_PX;
  const away: AxisMark = { ...PINNED, top, rowsOnScreen: PINNED.rowsOnScreen + PORT_PX };

  // Positive control: the move leaves the reader past the band the list reads as the end.
  expect(top + PORT_PX).toBeLessThan(PINNED.writtenPx - SCROLL_END_THRESHOLD_PX);
  expect(movedFromOutside(PINNED, away)).toBe(true);
});
