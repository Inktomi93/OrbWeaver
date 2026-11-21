// The hit segments every coverage input reduces to: an offset carries its innermost range's count, and two inputs sum.
import { expect, test } from "@orb/testkit/tooling";
import type { FunctionCoverage } from "../../../../tooling/src/floor/testing/coverage-collection.ts";
import { addHits, flattenHits } from "../../../../tooling/src/floor/testing/coverage-collection.ts";

const fn = (ranges: readonly (readonly [number, number, number])[]): FunctionCoverage => ({
  functionName: "",
  isBlockCoverage: true,
  ranges: ranges.map(([startOffset, endOffset, count]) => ({ startOffset, endOffset, count })),
});

test("a block inside a called function keeps its own zero count", () => {
  // The script [0,100) ran once; a function [10,60) ran twice; an untaken block [20,30) inside it never ran.
  const segments = flattenHits([
    fn([[0, 100, 1]]),
    fn([
      [10, 60, 2],
      [20, 30, 0],
    ]),
  ]);
  expect(segments).toEqual([
    { startOffset: 0, endOffset: 10, count: 1 },
    { startOffset: 10, endOffset: 20, count: 2 },
    { startOffset: 20, endOffset: 30, count: 0 },
    { startOffset: 30, endOffset: 60, count: 2 },
    { startOffset: 60, endOffset: 100, count: 1 },
  ]);
});

test("a block one test ran and another skipped is executed in the sum", () => {
  const ran = flattenHits([
    fn([
      [0, 50, 1],
      [20, 30, 1],
    ]),
  ]);
  const skipped = flattenHits([
    fn([
      [0, 50, 1],
      [20, 30, 0],
    ]),
  ]);
  const summed = addHits(skipped, ran);
  expect(summed).toEqual([
    { startOffset: 0, endOffset: 20, count: 2 },
    { startOffset: 20, endOffset: 30, count: 1 },
    { startOffset: 30, endOffset: 50, count: 2 },
  ]);
  // Control: the skipped test alone leaves the block at zero.
  expect(skipped.find((segment) => segment.startOffset === 20)?.count).toBe(0);
});

test("an offset only one input covers keeps that input's count", () => {
  const summed = addHits([{ startOffset: 0, endOffset: 10, count: 1 }], [{ startOffset: 5, endOffset: 20, count: 0 }]);
  // Adjacent pieces with one count stay one segment.
  expect(summed).toEqual([
    { startOffset: 0, endOffset: 10, count: 1 },
    { startOffset: 10, endOffset: 20, count: 0 },
  ]);
});
