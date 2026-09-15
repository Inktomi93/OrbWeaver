import { gate as typesInContract } from "../../../../tooling/src/verify/gates/types-in-contract.ts";
import { gate as verbNaming } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the converted server file-hook policies pass the final production proof runtime", () => {
  expect(verifyPolicyProofs([typesInContract, verbNaming])).toEqual([]);
});
