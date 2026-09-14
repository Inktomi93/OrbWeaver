import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as clientStructure } from "../../../../tooling/src/verify/gates/client-structure.ts";
import { gate as featureStructure } from "../../../../tooling/src/verify/gates/feature-structure.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, fixturePath, test } from "../../../support/tool-fixtures.ts";

const policies = [featureStructure, clientStructure] as const;

test("second resource layout policies keep their two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

// ---------------------------------------------------------------------------------------------------
// THE §4.5 REFUSAL PINS for both modules' declared authored trees (`resource-policy-contract.md` §3.6:
// one pin per DECLARED RESOURCE per REACHABLE non-ready status), absent until 2026-09-13 (#2327, the
// `policy-refusal-coverage` warning debt). No proof row can carry them: `resolveResourceDeclarations`
// throws in the POPULATION phase, before `create`, so the owner is withheld and the run surfaces a TOOL
// ERROR — and the conformance runner's `toolFailure` precedes any arm verdict (guide §4.5b).
//
// THE STATUS SET IS THE TREE READER'S, derived rather than copied: `ops/resource-reader.ts#tree` answers
// `missing` (nothing at the path), `empty` (the directory exists on disk with no members — the overlay
// cannot express that, so those pins use the real mkdtemp scratch root) and `unresolved` (`loadTree`
// threw; the reproducible cause is a regular FILE where the tree should be, and a symlink traversal is the
// same status by another route).
//
// AND `client-structure` DECLARES TWO TREES, which is why its pins run to six rather than three: a
// declaration set refuses on the FIRST non-ready member in canonical order, so each pin holds the other
// tree healthy and names the one it is testing. A single generic "a broken resource refuses" test would
// have proved `client-feature` twice and `server-domain` never.
// ---------------------------------------------------------------------------------------------------

/** A domain feature carrying every required template slot — the substrate both healthy twins stand on. */
const DOMAIN_TREE = {
  "packages/server/src/domain/character/index.ts": "export const x = 1;\n",
  "packages/server/src/domain/character/service.ts": "export const s = 1;\n",
  "packages/server/src/domain/character/context.ts": "export const c = 1;\n",
  "packages/server/src/domain/character/contract/service.ts": "export const cs = 1;\n",
  "packages/server/src/domain/character/verbs/read.ts": "export const v = 1;\n",
} as const;

/** A client feature slice that mirrors the domain above and violates none of the six layout rules. */
const CLIENT_TREE = {
  "packages/client/src/features/character/index.ts": "export const x = 1;\n",
  "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n",
} as const;

/** `client-structure` is HYBRID: its source population is the tsx under each feature's `surfaces` bucket,
 *  read from the Project, while both trees are read from the ResourceHost. A source-side anchor is
 *  therefore owed as well as the overlay — a population that admits nothing is a `[population]` tool error
 *  of its own and would mask the resource refusal under test. */
function pass(
  policy: GatePolicy,
  scratch: string,
  overlay: Readonly<Record<string, string>>,
  sources: Readonly<Record<string, string>> = {},
): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(sources)) {
    project.createSourceFile(`${scratch}/${path}`, content);
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: scratch,
    project,
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

function clientPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return pass(clientStructure, scratch, overlay, { "packages/client/src/features/character/surfaces/card-surface.tsx": "export const C = () => null;\n" });
}

/** The four facts that together say "this run is not a verdict" rather than "the tree is clean", read as
 *  one object so a refusal that drifted on ONE axis fails with the whole shape in the diff. */
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

/** The `empty` status needs a real directory with no members; the `unresolved` status needs a regular file
 *  standing where the tree should be. Both are disk states the overlay grammar cannot express. */
function emptyDirectory(scratch: string, relative: string): void {
  mkdirSync(join(scratch, relative), { recursive: true });
}

function fileAtTreePath(scratch: string, relative: string): void {
  // `parent` is sliced at runtime, so it carries no authored value; `fixturePath` bounds it (#2332).
  const parent = relative.slice(0, relative.lastIndexOf("/"));
  mkdirSync(fixturePath(scratch, parent), { recursive: true });
  writeFileSync(join(scratch, relative), "not a directory\n");
}

const DOMAIN_REL = "packages/server/src/domain";
const FEATURES_REL = "packages/client/src/features";

test("feature-structure: a MISSING server-domain tree refuses rather than passing over zero features", ({ scratch }) => {
  const result = pass(featureStructure, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-structure", "resource declaration authored-tree:server-domain is missing"));
});

test("feature-structure: an EMPTY server-domain tree is a refusal, not a template verdict over no domains", ({ scratch }) => {
  emptyDirectory(scratch, DOMAIN_REL);
  const result = pass(featureStructure, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-structure", "resource declaration authored-tree:server-domain is empty"));
});

test("feature-structure: a server-domain tree path that is a FILE refuses as unresolved", ({ scratch }) => {
  fileAtTreePath(scratch, DOMAIN_REL);
  const result = pass(featureStructure, scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("feature-structure", "resource declaration authored-tree:server-domain is unresolved"));
});

test("feature-structure: the healthy twin reaches a verdict on the same substrate and files one receipt", ({ scratch }) => {
  const result = pass(featureStructure, scratch, DOMAIN_TREE);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  // 8 members = the five fixture files plus the three directories BELOW the tree root (`character`,
  // `character/contract`, `character/verbs`); the root itself is never a member.
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([[{ kind: "resource", source: "authored-tree:server-domain", resources: 8, unresolved: 0 }]]);
});

test("feature-structure: the twin's silence is a READ — drop one required slot and it accuses", ({ scratch }) => {
  // The control for the control: the same tree minus `service.ts`. Without it the clean twin above could
  // be green because the tree was never walked.
  const { "packages/server/src/domain/character/service.ts": _dropped, ...withoutService } = DOMAIN_TREE;
  const result = pass(featureStructure, scratch, withoutService);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "feature-structure" }]);
});

test("client-structure: a MISSING client-feature tree refuses", ({ scratch }) => {
  const result = clientPass(scratch, DOMAIN_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:client-feature is missing"));
});

test("client-structure: an EMPTY client-feature tree refuses with its own status word", ({ scratch }) => {
  emptyDirectory(scratch, FEATURES_REL);
  const result = clientPass(scratch, DOMAIN_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:client-feature is empty"));
});

test("client-structure: a client-feature tree path that is a FILE refuses as unresolved", ({ scratch }) => {
  fileAtTreePath(scratch, FEATURES_REL);
  const result = clientPass(scratch, DOMAIN_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:client-feature is unresolved"));
});

test("client-structure: the SECOND declared tree refuses on its own — server-domain missing, client-feature intact", ({ scratch }) => {
  // The mirror arm reads `server-domain` to decide whether a feature name names a real domain, so a
  // missing domain tree would otherwise turn every built feature into a "mirrors no domain" finding —
  // the exact shape a refusal exists to prevent.
  const result = clientPass(scratch, CLIENT_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:server-domain is missing"));
});

test("client-structure: an EMPTY server-domain tree refuses too", ({ scratch }) => {
  emptyDirectory(scratch, DOMAIN_REL);
  const result = clientPass(scratch, CLIENT_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:server-domain is empty"));
});

test("client-structure: a server-domain tree path that is a FILE refuses as unresolved", ({ scratch }) => {
  fileAtTreePath(scratch, DOMAIN_REL);
  const result = clientPass(scratch, CLIENT_TREE);

  expect(refusalShape(result)).toEqual(populationRefusal("client-structure", "resource declaration authored-tree:server-domain is unresolved"));
});

test("client-structure: the healthy twin reaches a verdict with BOTH trees intact and files one receipt each", ({ scratch }) => {
  const result = clientPass(scratch, { ...CLIENT_TREE, ...DOMAIN_TREE });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "resource", source: "authored-tree:client-feature", resources: 4, unresolved: 0 },
      { kind: "resource", source: "authored-tree:server-domain", resources: 8, unresolved: 0 },
    ],
  ]);
});

test("client-structure: the twin's silence is a READ — rename the surface and it accuses", ({ scratch }) => {
  // The control for the control: the same two trees with the surface file not ending in `-surface.tsx`.
  const result = pass(
    clientStructure,
    scratch,
    {
      "packages/client/src/features/character/index.ts": "export const x = 1;\n",
      "packages/client/src/features/character/surfaces/card.tsx": "export const C = () => null;\n",
      ...DOMAIN_TREE,
    },
    { "packages/client/src/features/character/surfaces/card.tsx": "export const C = () => null;\n" },
  );

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "client-structure" }]);
});
