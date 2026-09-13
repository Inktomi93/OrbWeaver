import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/no-interactive-role-in-features.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/interactive-role-conversion";

function drive(source: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/features/demo/role.tsx`, source);
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
}

test("carries every legacy role and population proof through the final dispatcher", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the exact role attribute owns its ordinary waiver", () => {
  const raw = drive('export const G = <Row role="button" />;');
  expect(raw.toolErrors).toEqual([]);
  expect(raw.authority.effectiveFindings).toHaveLength(1);

  const waived = drive(
    'export const G = <Row\n// @orb-waive no-interactive-role-in-features(role): deliberate fixture; ends with this proof.\nrole="button" />;',
  );
  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);

  const wrong = drive('export const G = <Row\n// @orb-waive no-interactive-role-in-features(button): deliberately wrong position.\nrole="button" />;');
  expect(wrong.toolErrors).toEqual([]);
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("immutable aliases have no four-hop cutoff and parameter shadowing cannot borrow their value", () => {
  const resolved = drive('const A="button", B=A, C=B, D=C, E=D, F=E; export const G=<Row role={F}/>;');
  expect(resolved.toolErrors).toEqual([]);
  expect(resolved.authority.effectiveFindings).toHaveLength(1);
  const shadowed = drive('const ROLE="button"; export function G(ROLE: string) { return <Row role={ROLE}/>; }');
  expect(shadowed.toolErrors).toEqual([]);
  expect(shadowed.authority.effectiveFindings).toEqual([]);
});
