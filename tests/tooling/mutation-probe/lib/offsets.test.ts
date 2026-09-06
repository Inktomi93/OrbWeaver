// @instrument-proof: an impossible report location REFUSES rather than slicing — the probe's own header
//   states that a mutant planted one byte out reads as a SURVIVOR, so an unchecked bound is a false
//   negative for the whole mutation verdict, not a cosmetic bug.
import { lineStarts, offsetOf, offsetRangeOf } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

test("a location resolves to the byte the report meant", () => {
  const starts = lineStarts(SOURCE);
  // L2 C11 is the `2` in `const b = 2;` — an off-by-one here plants the mutant on the wrong character
  // and the suite stays green, which reads as a survivor rather than as a broken probe.
  expect(SOURCE[offsetOf(starts, { line: 2, column: 11 }, SOURCE.length)]).toBe("2");
  expect(SOURCE[offsetOf(starts, { line: 1, column: 1 }, SOURCE.length)]).toBe("c");
});

test("a source with no trailing newline still resolves its last line", () => {
  const noTrailing = "a\nbb";
  expect(noTrailing[offsetOf(lineStarts(noTrailing), { line: 2, column: 2 }, noTrailing.length)]).toBe("b");
});

test("a location past the end REFUSES rather than clamping to a wrong offset", () => {
  expect(() => offsetOf(lineStarts(SOURCE), { line: 99, column: 1 }, SOURCE.length)).toThrow(/past the end/u);
});

// The three unchecked bounds, each with the byte the OLD code planted (measured against HEAD before the
// fix): column 0 → offset -1, and `slice(0,-1) + X + slice(-1)` appends the mutant at the END OF THE FILE
// ("const a = 1;\nconst b = 2;X\n"); column 40 on a 12-column line → offset 39, a byte on a later line;
// an inverted range → "consXonst a = 1;", text the file never contained. All three produced a receipt.
test("a column below 1 REFUSES rather than producing a negative slice index", () => {
  const starts = lineStarts(SOURCE);
  expect(() => offsetOf(starts, { line: 1, column: 0 }, SOURCE.length)).toThrow(/not a 1-based column/u);
  expect(() => offsetOf(starts, { line: 1, column: -5 }, SOURCE.length)).toThrow(/not a 1-based column/u);
});

test("a column past its own line's end REFUSES rather than slicing into the next line", () => {
  const starts = lineStarts(SOURCE);
  // Line 1 is 12 characters; column 13 is the legal end-of-line position, column 14 is not.
  expect(offsetOf(starts, { line: 1, column: 13 }, SOURCE.length)).toBe(12);
  expect(() => offsetOf(starts, { line: 1, column: 14 }, SOURCE.length)).toThrow(/past the end of its own line/u);
});

test("an inverted range REFUSES rather than planting text the file never contained", () => {
  const starts = lineStarts(SOURCE);
  expect(offsetRangeOf(SOURCE, starts, { start: { line: 1, column: 1 }, end: { line: 1, column: 6 } })).toEqual({ from: 0, to: 5 });
  expect(() => offsetRangeOf(SOURCE, starts, { start: { line: 1, column: 5 }, end: { line: 1, column: 2 } })).toThrow(/ends before it starts/u);
});
