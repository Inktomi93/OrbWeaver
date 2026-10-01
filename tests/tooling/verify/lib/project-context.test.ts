import { normalizePathSet } from "../../../../tooling/src/verify/lib/policy-validation.ts";
import { repoRel } from "../../../../tooling/src/verify/lib/project-context.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("native roots and compiler paths reconcile into exact repository identities", () => {
  expect(repoRel("D:\\a\\orbweaver", "D:/a/orbweaver/tooling/src/example.ts")).toBe("tooling/src/example.ts");
  expect(repoRel("/checkout/orbweaver/", "/checkout/orbweaver/tooling/src/example.ts")).toBe("tooling/src/example.ts");
  expect(normalizePathSet([repoRel("D:\\a\\orbweaver", "D:/a/orbweaver/tests/example.test.ts")], "execution workspace path")).toEqual([
    "tests/example.test.ts",
  ]);
});

test("a similarly prefixed sibling is outside the execution workspace, never a relative member", () => {
  const outside = repoRel("/checkout/orbweaver", "/checkout/orbweaver-other/tooling/src/example.ts");
  expect(outside).toBe("../orbweaver-other/tooling/src/example.ts");
  expect(() => normalizePathSet([outside], "execution workspace path")).toThrow("execution workspace path has an invalid segment");
});
