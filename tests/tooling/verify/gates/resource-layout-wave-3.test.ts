import { gate as verifyRegistryParity } from "../../../../tooling/src/verify/gates/verify-registry-parity.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [verifyRegistryParity] as const;

test("third resource layout policy keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});
