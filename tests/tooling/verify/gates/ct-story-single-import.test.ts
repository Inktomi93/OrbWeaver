import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/ct-story-single-import.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("a CT story/component binding declared twice into one scope is flagged", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
