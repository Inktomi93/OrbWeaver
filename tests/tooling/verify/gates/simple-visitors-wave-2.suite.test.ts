import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as memberCardClamped } from "../../../../tooling/src/verify/gates/member-card-clamped.ts";
import { gate as testDeterminism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the converted second-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([memberCardClamped, testDeterminism])).toEqual([]);
});
