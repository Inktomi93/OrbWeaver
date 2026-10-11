import { gate } from "../../../../tooling/src/verify/gates/package-deep-import.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("every declared proof row holds through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
