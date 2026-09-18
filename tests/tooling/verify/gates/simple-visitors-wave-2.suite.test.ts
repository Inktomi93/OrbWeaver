import { gate as memberCardClamped } from "../../../../tooling/src/verify/gates/member-card-clamped.ts";
import { gate as testDeterminism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the converted second-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([memberCardClamped, testDeterminism])).toEqual([]);
});
