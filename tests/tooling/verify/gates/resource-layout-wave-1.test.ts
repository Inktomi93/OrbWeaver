import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as componentSize } from "../../../../tooling/src/verify/gates/component-size.ts";
import { gate as componentSizeUi } from "../../../../tooling/src/verify/gates/component-size-ui.ts";
import { gate as featureOwnsDefinition } from "../../../../tooling/src/verify/gates/feature-owns-definition.ts";
import { gate as packageLayout } from "../../../../tooling/src/verify/gates/package-layout.ts";
import { gate as serverLayout } from "../../../../tooling/src/verify/gates/server-layout.ts";
import { gate as uiExportsMapComplete } from "../../../../tooling/src/verify/gates/ui-exports-map-complete.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [componentSize, componentSizeUi, featureOwnsDefinition, packageLayout, serverLayout, uiExportsMapComplete] as const;

test("first resource layout policies keep their two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

test("package root exceptions require one exact reviewed-grant identity", ({ scratch }) => {
  const path = "packages/kit/src/loose.ts";
  const content = "export const loose = true;\n";
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(`${scratch}/${path}`, content);
  const result = runPolicyPass({
    knownPolicies: [packageLayout],
    policies: [packageLayout],
    root: scratch,
    project,
    resourceOptions: { overlay: { [path]: content } },
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "package-layout", file: path, subject: path, operation: "loose-package-root-module" }]);
});

/** The §4.5 refusal receipt these two resource policies had no pin for, and the reason the in-module
 *  `if (fact.status !== "ready") return;` guard was deleted from both: a BROKEN declared resource never
 *  reaches `evaluate` at all. `resolveResourceDeclarations` throws during the POPULATION phase
 *  (`lib/resource-declaration.ts:182`) and the run surfaces a TOOL ERROR, so the failure mode is loud —
 *  never the clean zero a silent return would have produced. The proof is two-sided on purpose: the
 *  SAME overlay minus one file flips a green pass into a named refusal, which is what rules out "the
 *  fixture simply had nothing to find". */
const SERVER_TREE = {
  "packages/server/src/index.ts": "export const x = 1;\n",
  "packages/server/src/entry/x.ts": "export const x = 1;\n",
  "packages/server/src/transport/x.ts": "export const x = 1;\n",
  "packages/server/src/domain/x.ts": "export const x = 1;\n",
  "packages/server/src/infra/x.ts": "export const x = 1;\n",
  "packages/server/src/foundation/x.ts": "export const x = 1;\n",
  "packages/server/src/kit/x.ts": "export const x = 1;\n",
} as const;
const SERVER_MANIFEST = { "packages/server/package.json": '{"name":"@orb/server","private":true}' } as const;

function serverLayoutPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [serverLayout],
    policies: [serverLayout],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("a complete resource population lets server-layout reach a verdict", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE, ...SERVER_MANIFEST });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("a missing declared resource refuses at the population phase rather than withholding silently", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE });

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ phase: "population" }]);
  expect(result.toolErrors.map((error) => error.message).join("; ")).toContain("resource declaration package-metadata:server is missing");
});

test("a malformed declared resource refuses at the same phase with its own status word", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE, "packages/server/package.json": '{"name":' });

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.toolErrors).toMatchObject([{ phase: "population" }]);
  expect(result.toolErrors.map((error) => error.message).join("; ")).toContain("resource declaration package-metadata:server is unresolved");
});
