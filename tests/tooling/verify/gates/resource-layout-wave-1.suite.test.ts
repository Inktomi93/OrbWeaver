import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/** The §4.5 refusal and receipt pins for the two resource exemplars (docs/law/resource-policy-contract.md
 *  §3.6), and the reason the in-module `if (fact.status !== "ready") return;` guard was deleted from both: a
 *  BROKEN declared resource never reaches `evaluate` at all. `resolveResourceDeclarations` throws during
 *  the POPULATION phase (`lib/resource-declaration.ts`), the owner is marked incomplete and WITHHELD, and
 *  the run surfaces a TOOL ERROR — never the clean zero a silent return would have produced. No proof row
 *  can express that (the conformance runner's `toolFailure` precedes the arm verdict), which is why these
 *  live here. The proof is two-sided on purpose: the SAME overlay minus one resource flips a green pass
 *  into a named refusal, one pin per declared resource per reachable status, which is what rules out "the
 *  fixture simply had nothing to find". The complete run additionally pins the receipt pair — one
 *  `kind: "resource"` receipt per declaration with `unresolved: 0` — so a declaration that stopped being
 *  consumed would read as a missing receipt here rather than as a quiet pass. No specifier-resolution
 *  control is owed: resource rows import nothing, so nothing can pass by fail-closed resolution. */
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

/** The shape every refusal below shares: a population-phase tool error naming the declaration and its
 *  status word, the owner incomplete and withheld, and NO finding — the four facts that together say
 *  "this run is not a verdict" rather than "the tree is clean". Read as one object so a test asserts it in
 *  one `expect`, and so a refusal that drifted on ONE axis (a finding leaking through, an owner completing)
 *  fails with the whole shape in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(policyId: string, fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId, phase: "population", message: expect.stringContaining(fragment) }],
    owners: [[policyId, "incomplete"]],
    withheld: [policyId],
  };
}

test("a complete resource population lets server-layout reach a verdict and file one receipt per declaration", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE, ...SERVER_MANIFEST });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // 13 members = the seven fixture files plus their six tier directories; the manifest is one member.
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "resource", source: "authored-tree:server", resources: 13, unresolved: 0 },
      { kind: "resource", source: "package:server", resources: 1, unresolved: 0 },
    ],
  ]);
});

test("a missing declared manifest refuses at the population phase rather than withholding silently", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE });

  expect(refusalShape(result)).toEqual(populationRefusal("server-layout", "resource declaration package-metadata:server is missing"));
});

test("a malformed declared manifest refuses at the same phase with its own status word", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_TREE, "packages/server/package.json": '{"name":' });

  expect(refusalShape(result)).toEqual(populationRefusal("server-layout", "resource declaration package-metadata:server is unresolved"));
});

test("a missing declared tree refuses the same way — the other declaration is not privileged", ({ scratch }) => {
  const result = serverLayoutPass(scratch, { ...SERVER_MANIFEST });

  expect(refusalShape(result)).toEqual(populationRefusal("server-layout", "resource declaration authored-tree:server is missing"));
});

test("an EMPTY declared tree is a refusal, not a verdict of six missing tiers", ({ scratch }) => {
  // The overlay cannot express an empty directory; the scratch fixture is a real mkdtemp root, so the
  // directory exists on disk with no members. This is the boundary `server-layout` mustFlag[2] sits on the
  // other side of: one file is a tree (six findings), zero files is no tree at all.
  mkdirSync(join(scratch, "packages/server/src"), { recursive: true });
  const result = serverLayoutPass(scratch, { ...SERVER_MANIFEST });

  expect(refusalShape(result)).toEqual(populationRefusal("server-layout", "resource declaration authored-tree:server is empty"));
});

const UI_BUTTON = { "packages/ui/src/primitives/button/index.ts": "export const Button = 1;\n" } as const;
const UI_MANIFEST = { "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":"./src/primitives/button/index.ts"}}' } as const;

function uiExportsPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [uiExportsMapComplete],
    policies: [uiExportsMapComplete],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("a complete resource population lets ui-exports-map-complete reach a verdict and file one receipt per declaration", ({ scratch }) => {
  const result = uiExportsPass(scratch, { ...UI_BUTTON, ...UI_MANIFEST });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // 6 members = the two fixture files plus the four directories between the `packages` root and the
  // deepest leaf (`ui`, `ui/src`, `ui/src/primitives`, `ui/src/primitives/button`); the root itself is
  // never a member, and nothing else is on this scratch root.
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "resource", source: "authored-tree:packages", resources: 6, unresolved: 0 },
      { kind: "resource", source: "package:ui", resources: 1, unresolved: 0 },
    ],
  ]);
});

test("ui-exports-map-complete: a missing manifest refuses at the population phase", ({ scratch }) => {
  const result = uiExportsPass(scratch, { ...UI_BUTTON });

  expect(refusalShape(result)).toEqual(populationRefusal("ui-exports-map-complete", "resource declaration package-metadata:ui is missing"));
});

test("ui-exports-map-complete: a malformed manifest refuses with its own status word", ({ scratch }) => {
  const result = uiExportsPass(scratch, { ...UI_BUTTON, "packages/ui/package.json": '{"name":' });

  expect(refusalShape(result)).toEqual(
    populationRefusal("ui-exports-map-complete", "resource declaration package-metadata:ui is unresolved: malformed package metadata"),
  );
});

// ---------------------------------------------------------------------------------------------------
// THE §4.5 REFUSAL PINS for `feature-owns-definition`'s one declared resource (`authored-tree:client-feature`),
// owed by `docs/law/resource-policy-contract.md` §3.6 — one pin per declared resource per REACHABLE non-ready status
// — and absent until 2026-09-13 (#2327, the `policy-refusal-coverage` warning debt). The two pin sets above
// cover `server-layout` and `ui-exports-map-complete`; this module declares the SAME KIND with a different
// id and inherits none of them, which is exactly why the contract asks per DECLARED RESOURCE.
//
// THE STATUS SET IS READ OFF THE TREE READER, not copied from the manifest kind above.
// `ops/resource-reader.ts#tree` can answer exactly three non-ready statuses for an authored tree:
//   • `missing`    — nothing at the tree path (`diskTreePresent` false and no overlay member beneath it);
//   • `empty`      — the directory EXISTS on disk and has no members, which the overlay cannot express, so
//                    the pin uses the real mkdtemp scratch root;
//   • `unresolved` — `loadTree` threw: the path is a regular FILE rather than a directory (a symlink
//                    traversal is the other cause of the SAME status; the contract asks one pin per status,
//                    and the file case is the one a lane reproduces without link semantics).
// `snapshot`'s arm is not reachable here — `authoredTree` never calls it.
// ---------------------------------------------------------------------------------------------------

const FEATURE_TREE = {
  "packages/client/src/features/character/index.ts": "export const x = 1;\n",
  "packages/client/src/features/character/lib/character-section.tsx": "export const S = () => null;\n",
} as const;

function featureOwnsPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [featureOwnsDefinition],
    policies: [featureOwnsDefinition],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("feature-owns-definition: a MISSING client-feature tree refuses instead of finding zero unowned features", ({ scratch }) => {
  const result = featureOwnsPass(scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-owns-definition", "resource declaration authored-tree:client-feature is missing"));
});

test("feature-owns-definition: an EMPTY client-feature tree is a refusal, not a clean sweep of no features", ({ scratch }) => {
  // The overlay cannot express an empty directory; the scratch fixture is a real mkdtemp root, so the
  // directory exists on disk with no members — the boundary between "no features" and "no tree".
  mkdirSync(join(scratch, "packages/client/src/features"), { recursive: true });
  const result = featureOwnsPass(scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-owns-definition", "resource declaration authored-tree:client-feature is empty"));
});

test("feature-owns-definition: a client-feature tree path that is a FILE refuses as unresolved", ({ scratch }) => {
  mkdirSync(join(scratch, "packages/client/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/client/src/features"), "not a directory\n");
  const result = featureOwnsPass(scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-owns-definition", "resource declaration authored-tree:client-feature is unresolved"));
});

test("feature-owns-definition: the healthy twin reaches a verdict on the same substrate and files one receipt", ({ scratch }) => {
  const result = featureOwnsPass(scratch, FEATURE_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [{ kind: "resource", source: "authored-tree:client-feature", resources: 4, unresolved: 0 }],
  ]);
});

test("feature-owns-definition: the twin's silence is a READ — one feature without a definition and it accuses", ({ scratch }) => {
  // The control for the control: the same healthy tree plus a second feature dir owning no definition.
  // Without it the clean twin could be green because the tree was never walked.
  const result = featureOwnsPass(scratch, { ...FEATURE_TREE, "packages/client/src/features/orphan/index.ts": "export const y = 1;\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "feature-owns-definition", token: "orphan" }]);
});

test("ui-exports-map-complete: an exports block that is not a string map is the REFUSAL half of the retired A4 arm", ({ scratch }) => {
  // Conditional exports are a legal npm shape the closed `PackageMetadata` contract does not model — the
  // provider refuses rather than flattening, so the policy never judges a map it could not read. The
  // VERDICT half (no `exports` key at all → `{}` → one A1 per module) is `mustFlag[5]` in the module.
  const result = uiExportsPass(scratch, {
    ...UI_BUTTON,
    "packages/ui/package.json": '{"name":"@orb/ui","private":true,"exports":{"./button":{"import":"./src/primitives/button/index.ts"}}}',
  });

  expect(refusalShape(result)).toEqual(
    populationRefusal(
      "ui-exports-map-complete",
      "resource declaration package-metadata:ui is unresolved: package metadata does not match the closed ui package contract",
    ),
  );
});
