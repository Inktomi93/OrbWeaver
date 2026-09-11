import { gate } from "../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a non-retrying expect() reading mutable async state in a CT is flagged, and a settled read is not", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
