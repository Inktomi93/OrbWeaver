// The two readers the edge table rests on: a trace's production citations, and the old-file lines a diff changed.
import { expect, test } from "@orb/testkit/tooling";
import { changedLines, productionRefs, rangeChanged } from "../../../../tooling/src/test-audit/index.ts";

test("a trace yields each production citation once, a bare path as the whole file, and drops test paths", () => {
  const trace = [
    "packages/kit/src/a.ts:12 predicate; packages/kit/src/a.ts:20-24 owner; packages/kit/src/a.ts:12 again.",
    "tests/kit/a.test.ts:4 the case itself; tests/support/node/db.ts:9 a helper.",
    "tooling/src/x/cli.ts650 full read, then packages/client/src/b.tsx:9-3 reversed.",
  ].join("\n");
  expect(productionRefs(trace)).toEqual([
    { path: "packages/kit/src/a.ts", startLine: 12, endLine: 12 },
    { path: "packages/kit/src/a.ts", startLine: 20, endLine: 24 },
    { path: "tooling/src/x/cli.ts", startLine: null, endLine: null },
    { path: "packages/client/src/b.tsx", startLine: 9, endLine: 9 },
  ]);
  expect(productionRefs("AF3-B032-F091 full activation290 actual durable bundle")).toEqual([]);
});

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,2 +10,3 @@ export function f() {",
  "@@ -30,0 +32,4 @@",
  "@@ -50 +55 @@",
  "diff --git a/src/mode.sh b/src/mode.sh",
  "old mode 100644",
  "new mode 100755",
  "",
].join("\n");

test("a range is changed only by a hunk that overlaps it, or by an insertion strictly inside it", () => {
  const changed = changedLines(DIFF);
  expect(changed.get("src/a.ts")).toEqual([
    { start: 10, count: 2 },
    { start: 30, count: 0 },
    { start: 50, count: 1 },
  ]);
  expect(rangeChanged(changed, "src/a.ts", 11, 14)).toBe(true);
  expect(rangeChanged(changed, "src/a.ts", 12, 29)).toBe(false);
  // The insertion lands after line 30: inside 29-31, past the end of 25-30, before the start of 31-40.
  expect(rangeChanged(changed, "src/a.ts", 29, 31)).toBe(true);
  expect(rangeChanged(changed, "src/a.ts", 25, 30)).toBe(false);
  expect(rangeChanged(changed, "src/a.ts", 31, 40)).toBe(false);
  expect(rangeChanged(changed, "src/a.ts", 50, 50)).toBe(true);
  expect(rangeChanged(changed, "src/a.ts", null, null)).toBe(true);
  expect(rangeChanged(changed, "src/other.ts", null, null)).toBe(false);
  // A change with no hunk, such as a mode change, still changes every range of its file.
  expect(rangeChanged(changed, "src/mode.sh", 1, 1)).toBe(true);
});
