// Conformance and positional waiver identity for computed form dependencies.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noFormStateInUseeffect } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { gate as noManualAutosaveFlush } from "../../../../tooling/src/verify/gates/no-manual-autosave-flush.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/simple-visitors-wave-4";

const FAMILY: readonly GatePolicy[] = [noFormStateInUseeffect];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

test("the converted fourth-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY: no-form-state-in-useeffect and no-manual-autosave-flush are both
// ordinary. A marker naming THIS finding's own policy at its own position suppresses it; a marker naming a
// DIFFERENT known ordinary policy at the same position must not.
// ---------------------------------------------------------------------------------------------------
test("a waiver naming a DIFFERENT known ordinary policy at the same position suppresses nothing", () => {
  const mismatched = runPolicyPass({
    knownPolicies: [noFormStateInUseeffect, noManualAutosaveFlush],
    policies: [noFormStateInUseeffect, noManualAutosaveFlush],
    root: ROOT,
    project: projectOf({
      "src/some-component.tsx":
        'const key = "store";\n// @orb-waive no-manual-autosave-flush(form[key]): wrong policy id entirely.\nuseEffect(() => {}, [form[key]]);\n',
    }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]?.policyId).toBe("no-form-state-in-useeffect");
});
