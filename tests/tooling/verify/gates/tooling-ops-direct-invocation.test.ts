// The standing family floor for `tooling-ops-direct-invocation` (#1950 "one hard policy"):
// what its declared rows structurally cannot express.
//
//   §4.5 — the two program-entry HOMES are located and receipted one receipt each, so an absent home or a
//          renamed export is a RECEIPT REFUSAL (a tool error, the policy withheld), never a finding and
//          never a silent zero. Conformance has no must-refuse arm (§4.5b), so the legacy blindness
//          example lives here as a `runPolicyPass` pin: guard home absent · runner home absent · guard
//          export renamed · the complete run's receipt pair. And the `entire-population` deferral: a
//          narrowed request must DEFER rather than refuse on a missing home it was never handed.
//   §4.6 — the conversion differential against the frozen legacy descriptor at `36bf5fa74`: every legacy
//          example replayed through the legacy `runPass` and the final policy, with the two classified
//          differences asserted rather than averaged: (1) POSITION — legacy file-level findings sat at
//          `0:0`, the final sink refuses a zero coordinate and anchors at `1:1`; (2) the BLINDNESS arm —
//          legacy reported one finding on the gate module's own path when a home's sole export could not
//          be derived; the final policy REFUSES at the receipt phase instead. Legacy-side coverage, read
//          first: 5 of 6 legacy examples exercise the per-file arm (3 flag, 2 pass shapes plus the
//          out-of-population row) and 1 exercises the blindness arm — nonzero on both, so the replay is
//          evidence and nothing here is constructed in place of it.
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/tooling-ops-direct-invocation.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/tooling-ops-direct-invocation";
const GUARD_HOME = "tooling/src/_shared/entrypoint.ts";
const RUNNER_HOME = "tooling/src/_shared/run-tool.ts";
const GUARD_SOURCE = "export function refuseDirectInvocation(u: string, e: string): void {\n  void u;\n  void e;\n}\n";
const RUNNER_SOURCE = "export async function runTool(m: () => number): Promise<void> {\n  void m;\n}\n";
const GUARDED_OPS =
  'import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";\n\nrefuseDirectInvocation(import.meta.url, "pnpm aa");\n\nexport const x = 1;\n';
const OPS = "tooling/src/aa/ops/x.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("tooling-ops-direct-invocation preserves its founding fixtures", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

// ─── §4.5 RECEIPT REFUSALS ──────────────────────────────────────────────────────────────────────────────

test("a complete run files ONE receipt per program-entry home, both resolved", () => {
  const complete = passOf({ [GUARD_HOME]: GUARD_SOURCE, [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: GUARDED_OPS });
  expect(complete.toolErrors).toEqual([]);
  expect(complete.authority.effectiveFindings).toEqual([]);
  expect(complete.policies[0]?.receipts).toEqual([
    { kind: "population", source: "program-entry home: entrypoint", members: 1, unresolved: 0 },
    { kind: "population", source: "program-entry home: run-tool", members: 1, unresolved: 0 },
  ]);
});

test("the GUARD home absent REFUSES at the receipt phase — the legacy blindness finding, now a tool error", () => {
  const blind = passOf({ [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: GUARDED_OPS });
  expect(blind.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(blind.toolErrors[0]?.message).toContain('"program-entry home: entrypoint" resolved zero members');
  expect(blind.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(blind.authority.effectiveFindings).toEqual([]);
});

test("the RUNNER home absent refuses on ITS OWN receipt — a summed pair would have read as members: 1", () => {
  const blind = passOf({ [GUARD_HOME]: GUARD_SOURCE, [OPS]: GUARDED_OPS });
  expect(blind.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(blind.toolErrors[0]?.message).toContain('"program-entry home: run-tool" resolved zero members');
  expect(blind.authority.withheldPolicyIds).toEqual([gate.id]);
});

test("a RENAMED guard export leaves the home's receipt unresolved and refuses — the legacy re-derived the new name silently", () => {
  const renamed = passOf({
    [GUARD_HOME]: "export function refuseEntry(u: string, e: string): void {\n  void u;\n  void e;\n}\n",
    [RUNNER_HOME]: RUNNER_SOURCE,
    [OPS]: 'import { refuseEntry } from "../../_shared/entrypoint.ts";\n\nrefuseEntry(import.meta.url, "pnpm aa");\n',
  });
  expect(renamed.toolErrors).toMatchObject([{ policyId: gate.id, phase: "receipt" }]);
  expect(renamed.toolErrors[0]?.message).toContain('"program-entry home: entrypoint" left 1 unresolved');
  expect(renamed.policies[0]?.receipts).toEqual([
    { kind: "population", source: "program-entry home: entrypoint", members: 0, unresolved: 1 },
    { kind: "population", source: "program-entry home: run-tool", members: 1, unresolved: 0 },
  ]);
});

test("a narrowed request DEFERS the entire-population policy instead of refusing on a home it was never handed", () => {
  const narrowed = passOf({ [GUARD_HOME]: GUARD_SOURCE, [RUNNER_HOME]: RUNNER_SOURCE, [OPS]: "export const x = 1;\n" }, [OPS]);
  expect(narrowed.toolErrors).toEqual([]);
  expect(narrowed.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  expect(narrowed.authority.effectiveFindings).toEqual([]);
});
