import { gate } from "../../../../tooling/src/verify/gates/ct-story-single-import.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a CT story/component binding declared twice into one scope is flagged", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
