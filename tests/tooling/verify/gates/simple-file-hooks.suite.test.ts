import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate as commentedCode } from "../../../../tooling/src/verify/gates/commented-code.ts";
import { gate as toolingSize } from "../../../../tooling/src/verify/gates/tooling-size.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the converted file-hook policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([commentedCode, toolingSize])).toEqual([]);
});
