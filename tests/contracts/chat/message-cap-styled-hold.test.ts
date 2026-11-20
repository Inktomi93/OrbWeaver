// The styled hold (`scanStyledHold`, D354) reads the largest message body the wire admits in linear time: the stream runs
// it on every frame for every viewer, over the model's own text.
// @subject packages/kit/src/content/index.ts

import { MESSAGE_TEXT_MAX_CHARS } from "@orb/contracts/chat";
import { scanStyledHold } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;
// The largest message body is forty times 100 KB. A linear hold reads it well inside this; the square-cost close search
// took 17 s on 100 KB.
const CAP_BUDGET_MS = 4000;

// The shapes that made one element's close search rescan the rest of the text, or a block's end search rescan every
// line.
const ELEMENT_SCAN_SHAPES = [
  ["an opener, then a line of the same name's openers that never close", (chars: number): string => `<x>\n${"<x ".repeat(chars / 3)}`],
  ["a block opener, then a line of block openers that never close", (chars: number): string => `<div>\n${"<div ".repeat(chars / 5)}`],
  ["openers of one name, one per line, none closed", (chars: number): string => "<x>\n".repeat(chars / 4)],
  ["elements each closed on the next line", (chars: number): string => "<x>\n</x>\n".repeat(chars / 9)],
] as const;
const HOLD_SIZES = [
  ["100 KB", 100_000, BUDGET_MS],
  ["the message cap", MESSAGE_TEXT_MAX_CHARS, CAP_BUDGET_MS],
] as const;

test.each(HOLD_SIZES.flatMap(([size, chars, budget]) => ELEMENT_SCAN_SHAPES.map(([shape, build]) => [`${shape}, at ${size}`, build(chars), budget] as const)))(
  "%s is held in linear time",
  (_name, body, budget) => {
    const started = performance.now();
    scanStyledHold(body);
    expect(performance.now() - started).toBeLessThan(budget);
  },
);
