// The Spine-Testing §10 gates through the production proof dispatcher: each policy's planted failing and passing
// controls, including the reviewed-grant witnesses, and the widened arms of the two older test-tree policies.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as noTestFabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { gate as testFileSize } from "../../../../tooling/src/verify/gates/test-file-size.ts";
import { gate as testHandShape } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { gate as testMockDoctrine } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { gate as testProductionClone } from "../../../../tooling/src/verify/gates/test-production-clone.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test.each([noTestFabrication, testMockDoctrine, testHandShape, testProductionClone, testFileSize])("$id keeps every planted control", (gate) => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
