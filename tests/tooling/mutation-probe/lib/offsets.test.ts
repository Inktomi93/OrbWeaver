import { lineStarts, offsetOf } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SOURCE = "const a = 1;\nconst b = 2;\nconst c = 3;\n";

test("a location resolves to the byte the report meant", () => {
  const starts = lineStarts(SOURCE);
  // L2 C11 is the `2` in `const b = 2;` — an off-by-one here plants the mutant on the wrong character
  // and the suite stays green, which reads as a survivor rather than as a broken probe.
  expect(SOURCE[offsetOf(starts, { line: 2, column: 11 })]).toBe("2");
  expect(SOURCE[offsetOf(starts, { line: 1, column: 1 })]).toBe("c");
});

test("a source with no trailing newline still resolves its last line", () => {
  const noTrailing = "a\nbb";
  expect(noTrailing[offsetOf(lineStarts(noTrailing), { line: 2, column: 2 })]).toBe("b");
});

test("a location past the end REFUSES rather than clamping to a wrong offset", () => {
  expect(() => offsetOf(lineStarts(SOURCE), { line: 99, column: 1 })).toThrow(/past the end/u);
});
