// The pattern must match its listed paths and nothing near them: a shared prefix or tail written once may not widen it.
import { expect, test } from "@orb/testkit/tooling";
import { exactPathPattern } from "../../../../tooling/src/floor/paths/exact-path-pattern.ts";

const LISTED = [
  "packages/a/src/index.ts",
  "packages/a/src/lib/index.ts",
  "packages/a/src/lib/deep/index.ts",
  "packages/b/src/index.ts",
  "packages/b/src/data.json",
  "packages/b/src/file.name+with(syntax)[chars].ts",
  // A listed path that is also the folder of another listed path.
  "tests/support",
  "tests/support/node.ts",
  "root.ts",
] as const;

// Each near miss differs from a listed path by one edit a merged prefix or tail could admit.
const NEAR_MISSES = [
  "packages/a/src/index.tsx",
  "xpackages/a/src/index.ts",
  "packages/a/src",
  "packages/a/src/lib",
  "packages/a/src/deep/index.ts",
  "packages/b/src/lib/index.ts",
  "packages/a/src/data.json",
  "packages/b/src/indexXts",
  "packages/b/src/file.name+with(syntax)[chars]Xts",
  "tests/support/",
  "tests",
  "tests/support/node.ts/more.ts",
  "root.ts/x",
  "",
] as const;

test("the pattern matches exactly the listed paths", () => {
  const pattern = new RegExp(exactPathPattern(LISTED), "u");
  expect(LISTED.filter((path) => !pattern.test(path))).toEqual([]);
  expect(NEAR_MISSES.filter((path) => pattern.test(path))).toEqual([]);
});

test("directories and tails that repeat are written once", () => {
  const pattern = exactPathPattern(["a/one/index.ts", "a/two/index.ts", "a/three/index.ts"]);
  expect(pattern.match(/index/gu)).toHaveLength(1);
  expect(pattern.match(/a\//gu)).toHaveLength(1);
});

test("an empty list matches only the empty path", () => {
  const pattern = new RegExp(exactPathPattern([]), "u");
  expect(["", "a", "a/b.ts"].filter((path) => pattern.test(path))).toEqual([""]);
});
