import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/dangling-ref-citations.ts";
import { shorthandExists } from "../../../../tooling/src/verify/lib/dangling-ref-citations.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("citation classification distinguishes an absent build from a generated-path typo", { timeout: scaledBudget(120_000) }, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("a testkit citation cannot borrow a basename from another world", () => {
  expect(
    shorthandExists(
      new Map<string, "file">([["tests/support/browser/fixtures.ts", "file"]]),
      [{ path: "tests/support/browser/fixtures.ts", kind: "file", bytes: 0, lines: 1, nulBytes: 0, nulLines: [], origin: "overlay" }],
      "@orb/testkit/node/fixtures",
    ),
  ).toBe(false);
});
