// The remaining OS-neutral source policy keeps its declared proofs and canonical case coverage.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { OS_NEUTRAL_CASES } from "../../../../tooling/src/verify/contract/os-neutral.ts";
import { gate as toolingOsNeutral } from "../../../../tooling/src/verify/gates/tooling-os-neutral.ts";
import { OS_NEUTRAL_CASE_MESSAGES } from "../../../../tooling/src/verify/lib/os-neutral.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const POLICIES = [toolingOsNeutral] as const;

test("the family's declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([...POLICIES])).toEqual([]);
});

test("every case the family reports has a mustFlag row that catches it", () => {
  const caught = toolingOsNeutral.mustFlag.map((row) => row.expect.messageIncludes);
  const uncaught = OS_NEUTRAL_CASES.filter((which) => !caught.some((fragment) => OS_NEUTRAL_CASE_MESSAGES[which].includes(fragment)));
  expect(uncaught).toEqual([]);
});
