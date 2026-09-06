import { Project } from "ts-morph";
import { gate as featureOwnsDefinition } from "../../../../tooling/src/verify/gates/feature-owns-definition.ts";
import { gate as packageLayout } from "../../../../tooling/src/verify/gates/package-layout.ts";
import { gate as serverLayout } from "../../../../tooling/src/verify/gates/server-layout.ts";
import { gate as uiExportsMapComplete } from "../../../../tooling/src/verify/gates/ui-exports-map-complete.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [featureOwnsDefinition, packageLayout, serverLayout, uiExportsMapComplete] as const;

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
