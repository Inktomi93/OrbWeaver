// The edge trims, tag-span strip and digit grouping stand in for patterns that went quadratic on a long run with no
// terminator; each keeps the answer of the pattern it replaced.
// @subject packages/kit/src/strings/index.ts

import { groupDigitRuns, isSpaceChar, replaceAngleSpans, trimEdgesWhile, trimEndWhile, trimStartWhile } from "@orb/kit/strings";
import { expect, test } from "@orb/testkit/node";

const BUDGET_MS = 1000;
const RUN = 400_000;

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

test("trims drop only the listed characters from the named edge", () => {
  expect(trimEndWhile("a--", "-")).toBe("a");
  expect(trimEndWhile("--a", "-")).toBe("--a");
  expect(trimStartWhile("--a--", "-")).toBe("a--");
  expect(trimEdgesWhile("__a_b__", "_")).toBe("a_b");
  expect(trimEdgesWhile("----", "-")).toBe("");
  expect(trimEndWhile("end.  \n", (char) => char === "." || isSpaceChar(char))).toBe("end");
});

test("angle spans: star form replaces an empty pair, plus form leaves it", () => {
  expect(replaceAngleSpans("a<>b<i>c", " ", true)).toBe("a b c");
  expect(replaceAngleSpans("a<>b<i>c", "", false)).toBe("a<>bc");
  expect(replaceAngleSpans("x < y <b>z", "", false)).toBe("x z");
  expect(replaceAngleSpans("<<<a", "", false)).toBe("<<<a");
});

test("digit grouping matches the boundary pattern on non-numbers too", () => {
  expect(groupDigitRuns("1234567")).toBe("1,234,567");
  expect(groupDigitRuns("999")).toBe("999");
  expect(groupDigitRuns("1234.5678")).toBe("1,234.5,678");
  expect(groupDigitRuns("a123456")).toBe("a,123,456");
  expect(groupDigitRuns("é123")).toBe("é123");
});

test("a long run with no terminator is scanned in linear time", () => {
  const hyphens = `${"-".repeat(RUN)}x`;
  const openers = "<".repeat(RUN);
  const digits = `${"7".repeat(RUN)}x`;
  expect(elapsedMs(() => trimEndWhile(hyphens, "-"))).toBeLessThan(BUDGET_MS);
  expect(elapsedMs(() => replaceAngleSpans(openers, "", false))).toBeLessThan(BUDGET_MS);
  expect(elapsedMs(() => groupDigitRuns(digits))).toBeLessThan(BUDGET_MS);
});
