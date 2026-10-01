import { gate } from "../../../../tooling/src/verify/gates/sole-env-reader.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

test("environment reads and writes retain resolved identity and exact grant grain", { timeout: scaledBudget(120_000) }, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
