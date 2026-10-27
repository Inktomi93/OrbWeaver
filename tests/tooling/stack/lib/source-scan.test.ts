import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { newestSourceEntries } from "../../../../tooling/src/stack/lib/source-scan.ts";

test("an unreadable source directory fails loud instead of fabricating a partial newest-source time", ({ scratch }) => {
  const readable = join(scratch, "readable.ts");
  writeFileSync(readable, "export {};\n");
  const failure = Object.assign(new Error("planted directory read failure"), { code: "EIO" });
  let refused = false;
  const reads = {
    readDirectory: (path: string) => {
      if (refused) {
        throw failure;
      }
      return readdirSync(path, { withFileTypes: true });
    },
    stat: statSync,
  };
  expect(newestSourceEntries([scratch], undefined, reads).map((entry) => entry.path)).toEqual([readable]);
  refused = true;
  expect(() => newestSourceEntries([scratch], undefined, reads)).toThrow(failure);
});

test("an unreadable source file fails loud instead of disappearing from freshness evidence", ({ scratch }) => {
  const leaf = join(scratch, "leaf.ts");
  writeFileSync(leaf, "export {};\n");
  const failure = Object.assign(new Error("planted source stat failure"), { code: "EIO" });
  let refused = false;
  const reads = {
    readDirectory: (path: string) => readdirSync(path, { withFileTypes: true }),
    stat: (path: string) => {
      if (refused) {
        throw failure;
      }
      return statSync(path);
    },
  };
  expect(newestSourceEntries([leaf], undefined, reads).map((entry) => entry.path)).toEqual([leaf]);
  expect(newestSourceEntries([join(scratch, "absent")])).toEqual([]);
  refused = true;
  expect(() => newestSourceEntries([leaf], undefined, reads)).toThrow(failure);
});
