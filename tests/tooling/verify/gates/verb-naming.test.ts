import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as verbNaming } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the verb-naming policy passes the final production proof runtime", () => {
  expect(verifyPolicyProofs([verbNaming])).toEqual([]);
});
