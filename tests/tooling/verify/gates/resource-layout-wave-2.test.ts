import { gate as clientStructure } from "../../../../tooling/src/verify/gates/client-structure.ts";
import { gate as featureStructure } from "../../../../tooling/src/verify/gates/feature-structure.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [featureStructure, clientStructure] as const;

test("second resource layout policies keep their two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});
