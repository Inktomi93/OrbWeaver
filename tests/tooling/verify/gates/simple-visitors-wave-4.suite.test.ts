// Conformance and positional waiver identity for computed form dependencies and persisted-store options.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as noFormStateInUseeffect } from "../../../../tooling/src/verify/gates/no-form-state-in-useeffect.ts";
import { gate as persistPartializeAndTotalMigrate } from "../../../../tooling/src/verify/gates/persist-partialize-and-total-migrate.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/simple-visitors-wave-4";

const FAMILY: readonly GatePolicy[] = [noFormStateInUseeffect, persistPartializeAndTotalMigrate];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(policy: GatePolicy, files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project: projectOf(files), reviewedGrants: [], failOnWarnings: false });
}

test("the converted fourth-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// ORDINARY MARKER IDENTITY: no-form-state-in-useeffect and persist-partialize-and-total-migrate are both
// ordinary. A marker naming THIS finding's own policy at its own position suppresses it; a marker naming a
// DIFFERENT known ordinary policy at the same position must not.
// ---------------------------------------------------------------------------------------------------
test("a waiver naming a DIFFERENT known ordinary policy at the same position suppresses nothing", () => {
  const mismatched = runPolicyPass({
    knownPolicies: [noFormStateInUseeffect, persistPartializeAndTotalMigrate],
    policies: [noFormStateInUseeffect, persistPartializeAndTotalMigrate],
    root: ROOT,
    project: projectOf({
      "src/some-component.tsx":
        'const key = "store";\n// @orb-waive persist-partialize-and-total-migrate(form[key]): wrong policy id entirely.\nuseEffect(() => {}, [form[key]]);\n',
    }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.effectiveFindings[0]?.policyId).toBe("no-form-state-in-useeffect");
});

test("the ordinary waiver door on persist-partialize-and-total-migrate is REACHABLE — the #1954 defect", () => {
  const waived = passOf(persistPartializeAndTotalMigrate, {
    "packages/client/src/state/create-persisted-store.ts":
      "// @orb-waive persist-partialize-and-total-migrate(persist): probe — the ordinary door must be reachable.\nexport const s = persist(() => ({}), {});\n",
  });
  // Before the collapse this same fixture produced three byte-identical findings, so the marker resolved
  // `over-broad` and suppressed NONE of them — an ordinary policy whose only recourse was editing the
  // factory it objected to.
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});
