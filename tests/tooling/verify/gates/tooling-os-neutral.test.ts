// Family test for `tooling-os-neutral`, a singleton: its declared rows through the production dispatcher.
import { gate } from "../../../../tooling/src/verify/gates/tooling-os-neutral.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
