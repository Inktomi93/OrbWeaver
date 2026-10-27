import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { newestSourceEntries } from "../../../../tooling/src/stack/lib/source-scan.ts";

test("an unreadable source directory fails loud instead of fabricating a partial newest-source time", ({ scratch }) => {
  const readable = join(scratch, "readable.ts");
  writeFileSync(readable, "export {};\n");
  expect(newestSourceEntries([scratch]).map((entry) => entry.path)).toEqual([readable]);
  const loop = join(scratch, "loop");
  symlinkSync(loop, loop);
  expect(() => newestSourceEntries([scratch])).toThrow(/ELOOP/u);
});

test("an unreadable source file fails loud instead of disappearing from freshness evidence", ({ scratch }) => {
  const leaf = join(scratch, "leaf.ts");
  writeFileSync(leaf, "export {};\n");
  expect(newestSourceEntries([leaf]).map((entry) => entry.path)).toEqual([leaf]);
  expect(newestSourceEntries([join(scratch, "absent")])).toEqual([]);
  expect(() => newestSourceEntries([join(leaf, "child")])).toThrow(/ENOTDIR/u);
});
