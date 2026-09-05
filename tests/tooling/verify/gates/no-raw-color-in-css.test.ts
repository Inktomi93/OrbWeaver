import { gate } from "../../../../tooling/src/verify/gates/no-raw-color-in-css.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("no-raw-color-in-css final policy proofs remain conformant", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
