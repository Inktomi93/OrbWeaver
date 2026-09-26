// Family test for `tooling-os-neutral`, a singleton: its declared rows through the production dispatcher,
// and a pin that every case the policy can report has a row that makes it report.
import { OS_NEUTRAL_CASES } from "../../../../tooling/src/verify/contract/os-neutral.ts";
import { gate } from "../../../../tooling/src/verify/gates/tooling-os-neutral.ts";
import { OS_NEUTRAL_CASE_MESSAGES } from "../../../../tooling/src/verify/lib/os-neutral.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("every case the policy reports has a mustFlag row that catches it", () => {
  const caught = gate.mustFlag.map((row) => row.expect.messageIncludes);
  const uncaught = OS_NEUTRAL_CASES.filter((which) => !caught.some((fragment) => OS_NEUTRAL_CASE_MESSAGES[which].includes(fragment)));
  expect(uncaught).toEqual([]);
});
