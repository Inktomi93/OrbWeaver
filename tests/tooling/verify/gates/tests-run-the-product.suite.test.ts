// The Spine-Testing §10 gates through the production proof dispatcher: each policy's planted failing and passing
// controls, including the reviewed-grant witnesses, and the widened arms of the two older test-tree policies.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as testHandShape } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { gate as testMockDoctrine } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { gate as testProductionClone } from "../../../../tooling/src/verify/gates/test-production-clone.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

test.each([testMockDoctrine, testHandShape])("$id keeps every planted control", (gate) => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("test-production-clone keeps every planted control", { timeout: scaledBudget(15_000) }, () => {
  expect(verifyPolicyProofs([testProductionClone])).toEqual([]);
});
