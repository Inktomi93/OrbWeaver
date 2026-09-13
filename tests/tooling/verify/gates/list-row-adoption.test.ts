import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/list-row-adoption.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/list-row-conversion";
const IMPORT = 'import { LibraryListLayout } from "#components";\n';

function drive(source: string, outside?: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/packages/client/src/features/demo/rows.tsx`, source);
  if (outside !== undefined) {
    project.createSourceFile(`${ROOT}/packages/ui/src/rows.tsx`, outside);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
}

test("retains all six legacy row-render proofs through final dispatch", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the reported row root owns its ordinary waiver and a different position does not", () => {
  const source = `${IMPORT}export const X = items.map(item => (\n<div onClick={() => select(item)} />));`;
  const raw = drive(source);
  expect(raw.toolErrors).toEqual([]);
  expect(raw.authority.effectiveFindings).toHaveLength(1);
  const waived = drive(source.replace("<div", "// @orb-waive list-row-adoption(div): intentional proof row only.\n<div"));
  expect(waived.toolErrors).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
  const wrong = drive(source.replace("<div", "// @orb-waive list-row-adoption(onClick): wrong position control.\n<div"));
  expect(wrong.toolErrors).toEqual([]);
  expect(wrong.authority.waivedFindings).toEqual([]);
  expect(wrong.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("shared dispatch preserves function-expression returns and the client population fence", () => {
  const source = `${IMPORT}export const X = items.map(function(item) { return <div onClick={() => select(item)} />; });`;
  const inside = drive(source);
  expect(inside.toolErrors).toEqual([]);
  expect(inside.authority.effectiveFindings).toHaveLength(1);
  const outside = drive("export const anchor = <div />;", source);
  expect(outside.toolErrors).toEqual([]);
  expect(outside.authority.effectiveFindings).toEqual([]);
});
