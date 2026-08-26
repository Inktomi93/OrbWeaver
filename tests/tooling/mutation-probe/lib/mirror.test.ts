import { mirrorCandidates } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a package source derives its three node mirror kinds", () => {
  expect(mirrorCandidates("packages/server/src/domain/admin/guard.ts")).toEqual([
    "tests/server/domain/admin/guard.test.ts",
    "tests/server/domain/admin/guard.int.test.ts",
    "tests/server/domain/admin/guard.contract.test.ts",
  ]);
});

test("a tooling source derives against the tests/tooling mirror", () => {
  expect(mirrorCandidates("tooling/src/mutation-probe/lib/offsets.ts")).toContain("tests/tooling/mutation-probe/lib/offsets.test.ts");
});

test("a path outside either mirrored tree yields NO candidates rather than a guess", () => {
  expect(mirrorCandidates("scripts/probes/whatever.ts")).toEqual([]);
  expect(mirrorCandidates("tests/server/domain/admin/guard.test.ts")).toEqual([]);
});
