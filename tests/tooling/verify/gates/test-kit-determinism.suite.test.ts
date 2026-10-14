import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as determinism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { gate as mocks } from "../../../../tooling/src/verify/gates/test-mock-doctrine.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("testkit determinism and mock doctrine discriminate their declared subjects", () => {
  expect(verifyPolicyProofs([determinism, mocks])).toEqual([]);
});
