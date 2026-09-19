// Family test for `no-opaque-test-fixture` (#1630) — a declared SINGLETON: no other policy judges a
// fixture module's declared export TYPES, and the cast-expression subject next door belongs to
// `no-test-fabrication`.
//
// WHAT ONLY THIS FILE CAN PROVE, because a declared row structurally cannot (GATE-AUTHORING §5):
//   · §4.2 THE ORDINARY IDENTITY ARM — the correct `@orb-waive` marker at the reported position consumes
//     exactly ONE finding, leaves ZERO effective findings and ZERO authority alarms. A `mustPass` row
//     asserts none of those three numbers; it only asserts that nothing survived.
//   · THE DEAD-POSITION ALARM — the same marker naming a position this policy never reports must ALARM
//     rather than silently suppress. Without this arm a marker engine matching on the CARRIER alone would
//     read identically to the arm above, and the whole waiver door would be unproven.
//   · THE OVERLAP CLAIM the module's header makes with `no-test-fabrication`: that the two policies judge
//     DIFFERENT shapes and do not double-report one site. A header that asserts a guarantee owes a control.
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-opaque-test-fixture.ts";
import { gate as noTestFabrication } from "../../../../tooling/src/verify/gates/no-test-fabrication.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/no-opaque-test-fixture";
const FIXTURE = "tests/client/features/rpg/fixtures.ts";

interface Run {
  readonly hits: readonly string[];
  readonly waived: number;
  readonly alarms: readonly string[];
}

function run(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>): Run {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  const result = runPolicyPass({ knownPolicies: policies, policies, root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  return {
    hits: result.authority.effectiveFindings.map((finding) => `${finding.policyId}@${finding.line}`),
    waived: result.authority.waivedFindings.length,
    alarms: result.authority.authorityAlarms.map((alarm) => `${alarm.kind}:${alarm.policyId}`),
  };
}

test("the policy's own declared proofs hold through the production dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the descriptor shape is the thing under test: ordinary, error, selected-files, singleton family", () => {
  expect([gate.id, gate.family, gate.authority, gate.severity, gate.analysis, gate.execution]).toEqual([
    "no-opaque-test-fixture",
    "no-opaque-test-fixture",
    "ordinary",
    "error",
    "types",
    "selected-files",
  ]);
});

// §4.2. The marker names `unknown`, which is the ANNOTATION — the token the module reports and the fix
// text promises. One raw finding, one consumed, nothing left, nothing complained about.
test("the reported position IS the waiver position: one consumed, zero effective, zero alarms", () => {
  const waived = run([gate], {
    [FIXTURE]:
      "// @orb-waive no-opaque-test-fixture(unknown): the family-test stand-in reason; ends when this fixture stops flagging.\nexport function makeGame(): unknown {\n  return {};\n}\n",
  });
  expect({ hits: waived.hits, waived: waived.waived, alarms: waived.alarms }).toEqual({ hits: [], waived: 1, alarms: [] });
});

// THE DISCRIMINATION CONTROL, committed rather than run by hand: the same policy, the same statement, a
// position this policy never reports. A marker engine keyed on the carrier alone would suppress here too.
test("a marker naming a position the policy never reports ALARMS instead of suppressing", () => {
  const offByOne = run([gate], {
    [FIXTURE]:
      "// @orb-waive no-opaque-test-fixture(makeGame): the family-test stand-in reason; ends when this fixture stops flagging.\nexport function makeGame(): unknown {\n  return {};\n}\n",
  });
  expect(offByOne.waived).toBe(0);
  expect(offByOne.hits).toHaveLength(1);
  expect(offByOne.alarms.join(" | ")).toContain("no-opaque-test-fixture");
});

// THE HEADER'S OVERLAP CLAIM, driven. The two policies are run TOGETHER over one file carrying one of
// each shape, and each site is reported by exactly one of them.
test("no double report with no-test-fabrication: each policy sees the shape the other cannot", () => {
  const both = run([gate, noTestFabrication], {
    [FIXTURE]:
      "interface Game {\n" +
      "  readonly ruleset: string;\n" +
      "}\n" +
      "export function makeGame(): unknown {\n" +
      "  return {};\n" +
      "}\n" +
      "export function fabricate(): Game {\n" +
      "  return {} as unknown as Game;\n" +
      "}\n",
  });
  expect(both.alarms).toEqual([]);
  // Line 4 is the `unknown` return annotation; line 8 is the double cast. Neither line carries two
  // findings, and neither policy reports the other's line.
  expect([...both.hits].sort()).toEqual(["no-opaque-test-fixture@4", "no-test-fabrication@8"]);
});

// The other half of the same claim: the FIXTURE-SHAPED defect this policy exists for is invisible to
// `no-test-fabrication`, which is why the overlap analysis ends in two policies rather than one.
test("no-test-fabrication alone reads a `: unknown` fixture export completely clean", () => {
  const alone = run([noTestFabrication], { [FIXTURE]: "export function makeGame(): unknown {\n  return {};\n}\n" });
  expect({ hits: alone.hits, waived: alone.waived, alarms: alone.alarms }).toEqual({ hits: [], waived: 0, alarms: [] });
});
