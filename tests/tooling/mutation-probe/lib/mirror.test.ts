import { mirrorCandidates } from "../../../../tooling/src/mutation-probe/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a package source derives every module-mirrored Vitest kind in stable family order", () => {
  expect(mirrorCandidates("packages/server/src/domain/admin/guard.ts")).toEqual([
    "tests/server/domain/admin/guard.dom.test.ts",
    "tests/server/domain/admin/guard.test.ts",
    "tests/server/domain/admin/guard.test.tsx",
    "tests/server/domain/admin/guard.int.test.ts",
    "tests/server/domain/admin/guard.contract.test.ts",
  ]);
});

test("DOM-capable Vitest mirrors are eligible while suite, type-only, CT, and E2E kinds are not", () => {
  const candidates = mirrorCandidates("packages/client/src/data/auth-config.ts");
  expect(candidates).toContain("tests/client/data/auth-config.dom.test.ts");
  expect(candidates).not.toContain("tests/client/data/auth-config.suite.test.ts");
  expect(candidates).not.toContain("tests/client/data/auth-config.test-d.ts");
  expect(candidates).not.toContain("tests/client/data/auth-config.ct.tsx");
  expect(candidates).not.toContain("tests/client/data/auth-config.spec.ts");
});

test("a TSX source only derives registry kinds that declare TSX source compatibility", () => {
  expect(mirrorCandidates("packages/client/src/app.tsx")).toEqual(["tests/client/app.dom.test.ts", "tests/client/app.test.tsx"]);
});

test("a tooling source derives against the tests/tooling mirror", () => {
  expect(mirrorCandidates("tooling/src/mutation-probe/lib/offsets.ts")).toContain("tests/tooling/mutation-probe/lib/offsets.test.ts");
});

test("a path outside either mirrored tree yields NO candidates rather than a guess", () => {
  expect(mirrorCandidates("scripts/probes/whatever.ts")).toEqual([]);
  expect(mirrorCandidates("tests/server/domain/admin/guard.test.ts")).toEqual([]);
});
