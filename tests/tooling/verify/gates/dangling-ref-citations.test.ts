import { gate } from "../../../../tooling/src/verify/gates/dangling-ref-citations.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("citation classification distinguishes an absent build from a generated-path typo", { timeout: scaledBudget(120_000) }, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
