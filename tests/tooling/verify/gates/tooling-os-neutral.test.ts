// Family test for `tooling-os-neutral`: both policies' declared rows through the production dispatcher,
// every canonical case has a catch row, and the resource sibling refuses a broken tracked-files input.
import { join } from "node:path";
import { Project } from "ts-morph";
import { OS_NEUTRAL_CASES } from "../../../../tooling/src/verify/contract/os-neutral.ts";
import { gate as testExecutableMode } from "../../../../tooling/src/verify/gates/test-executable-mode.ts";
import { gate as toolingOsNeutral } from "../../../../tooling/src/verify/gates/tooling-os-neutral.ts";
import { OS_NEUTRAL_CASE_MESSAGES } from "../../../../tooling/src/verify/lib/os-neutral.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [toolingOsNeutral, testExecutableMode] as const;

test("the family's declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([...POLICIES])).toEqual([]);
});

test("every case the family reports has a mustFlag row that catches it", () => {
  const caught = [...toolingOsNeutral.mustFlag, ...testExecutableMode.mustFlag].map((row) => row.expect.messageIncludes);
  const uncaught = OS_NEUTRAL_CASES.filter((which) => !caught.some((fragment) => OS_NEUTRAL_CASE_MESSAGES[which].includes(fragment)));
  expect(uncaught).toEqual([]);
});

test("an unresolved tracked index withholds the executable-mode owner instead of returning a clean verdict", ({ scratch }) => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(join(scratch, "tests/example.test.ts"), "export const example = true;\n");
  const result = runPolicyPass({
    knownPolicies: [...POLICIES],
    policies: [testExecutableMode],
    root: scratch,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toHaveLength(1);
  expect(result.toolErrors[0]).toMatchObject({ policyId: testExecutableMode.id, phase: "population" });
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([testExecutableMode.id]);
});
