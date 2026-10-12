// The standing conformance + differential net for the fourth SIMPLE-tier wave (#1584/#1943): two pure
// syntax policies converted from free-form `visitFile`/descendant-walk descriptors into kind-indexed
// `defineGate` visitors with all state moved into `create`.
//
//   no-form-state-in-useeffect             — the legacy `deps.forEachDescendant` walk inverted into a
//                                              direct MEMBER_ACCESS_KINDS subscription plus an ancestor
//                                              climb (#1506 identity-not-spelling preserved).
//   persist-partialize-and-total-migrate    — factory options completeness; since #1954 it reports ONE finding
//                                              per call site rather than one per missing key, so its ordinary
//                                              waiver door is addressable at all. The bare `persist(` ban
//                                              lives in eslint.config.js (`orb/no-raw-zustand-persist`).
//
// Same recipe as simple-visitors-wave-2.suite.test.ts: `verifyPolicyProofs` runs each final policy's own proofs
// through the production runtime; the differential replays every ORIGINAL mustFlag/mustPass example from
// the frozen pre-conversion source (79e5f7e6db, the commit immediately before this wave) through both the
// legacy dispatcher and the final one.

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
        "// @orb-waive persist-partialize-and-total-migrate(form.state.values): wrong policy id entirely.\nuseEffect(() => {}, [form.state.values]);\n",
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
