import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as dCitationIntegrity } from "../../../../tooling/src/verify/gates/d-citation-integrity.ts";
import { gate as danglingDocCite } from "../../../../tooling/src/verify/gates/dangling-doc-cite.ts";
import { gate as pdCitationIntegrity } from "../../../../tooling/src/verify/gates/pd-citation-integrity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [dCitationIntegrity, danglingDocCite, pdCitationIntegrity] as const;

test("the text-citation family keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

/** The §4.5 refusal and receipt pins for the three text-citation policies
 *  (`docs/design/resource-policy-contract.md` §3.6). No proof row can carry any of them: the conformance
 *  runner's `toolFailure` runs BEFORE the arm verdict, so an arm whose correct outcome is a refusal is
 *  neither `mustFlag` (nothing is reported) nor `mustPass` (the owner did not succeed). Two classes live
 *  here. The first is the RUNTIME's refusal — a declared resource that is missing, empty or unresolved
 *  makes `resolveResourceDeclarations` throw at the POPULATION phase, the owner is marked incomplete and
 *  WITHHELD, and no finding survives; that is what rules out "the fixture simply had nothing to find", and
 *  it is why none of the three modules owns a not-ready branch. The second is a policy's OWN in-evaluate
 *  refusal, which exists where the runtime cannot see the hole: a citer corpus whose derivation resolved
 *  nothing is "I could not judge", not "the tree is clean". The complete-run pins hold the receipt pair,
 *  so a declaration that stopped being consumed reads as a missing receipt here rather than a quiet pass. */
const DOCS_ROOT = "docs/architecture";
const D_REGISTRY = `${DOCS_ROOT}/core/Core-Path-Registry.md`;
const D_REGISTRY_TEXT = "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n";
const PD_ACTIVE = `${DOCS_ROOT}/core/Core-Audits-and-Debt.md`;
const PD_CLEARED = `${DOCS_ROOT}/history/Core-Debt-Cleared-Ledger.md`;
const ANCHOR_TEXT = "export const anchor = 1;\n";

/** Materialize the fixture the way `ops/policy-conformance.ts#runResourceExample` does — on DISK and in
 *  the index as well as in the overlay — because `tracked-files` shells `ls-files` against the invocation
 *  root and an overlay-only fixture refuses with *"not a repository"* before any arm runs. */
function pass(policy: GatePolicy, scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const [path, content] of Object.entries(overlay)) {
    const absolute = join(scratch, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    if (path.endsWith(".ts")) {
      project.addSourceFileAtPath(absolute);
    }
  }
  for (const args of [
    ["init", "--quiet"],
    ["add", "--all"],
  ]) {
    runNicedSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: scratch });
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

/** The shape every refusal shares: a tool error naming the declaration and its status word, the owner
 *  incomplete and withheld, and NO finding — the four facts that together say "this run is not a verdict"
 *  rather than "the tree is clean". Read as one object so a refusal that drifted on ONE axis (a finding
 *  leaking through, an owner completing) fails with the whole shape in the diff. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function refusal(policyId: string, phase: string, fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId, phase, message: expect.stringContaining(fragment) }],
    owners: [[policyId, "incomplete"]],
    withheld: [policyId],
  };
}

test("d-citation-integrity: a complete population reaches a verdict and files one receipt per declaration", ({ scratch }) => {
  const result = pass(dCitationIntegrity, scratch, { [D_REGISTRY]: D_REGISTRY_TEXT, "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n" });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "population", source: "core-doc-citers", members: 1, unresolved: 0 },
      { kind: "population", source: "d-ledger-documents", members: 1, unresolved: 0 },
      // `authored-text` is a DEMAND door, so its receipt is keyed by the exact subject it was asked for.
      { kind: "resource", source: "authored-text#1", resources: 1, unresolved: 0 },
      { kind: "resource", source: "authored-tree:docs", resources: 3, unresolved: 0 },
      { kind: "resource", source: "ledger:core-path-registry", resources: 1, unresolved: 0 },
    ],
  ]);
});

test("d-citation-integrity: an ABSENT registry refuses the whole run — a half-read D-ledger INVERTS every judgment", ({ scratch }) => {
  const result = pass(dCitationIntegrity, scratch, {
    [`${DOCS_ROOT}/core/Other.md`]: "no registry here.\n",
    "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n",
  });

  expect(refusalShape(result)).toEqual(refusal("d-citation-integrity", "population", "resource declaration ledger:core-path-registry is missing"));
});

test("d-citation-integrity: an EMPTY registry refuses with its own status word rather than reading as zero anchors", ({ scratch }) => {
  const result = pass(dCitationIntegrity, scratch, { [D_REGISTRY]: "", "packages/contracts/src/x.ts": "// per D1.\nexport const x = 1;\n" });

  expect(refusalShape(result)).toEqual(refusal("d-citation-integrity", "population", "resource declaration ledger:core-path-registry is empty"));
});

test("d-citation-integrity: an ABSENT docs tree refuses too — the corpus door is not privileged over the identity door", ({ scratch }) => {
  // The overlay cannot express an absent directory beside a present file, so the registry is written to
  // the real scratch root and the docs tree is left off the overlay entirely.
  mkdirSync(join(scratch, "packages/contracts/src"), { recursive: true });
  writeFileSync(join(scratch, "packages/contracts/src/x.ts"), "export const x = 1;\n");
  const result = pass(dCitationIntegrity, scratch, {});

  expect(result.toolErrors.map(({ policyId, phase }) => ({ policyId, phase }))).toEqual([{ policyId: "d-citation-integrity", phase: "population" }]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual(["d-citation-integrity"]);
});

test("pd-citation-integrity: a complete population reaches a verdict and files one receipt per declaration", ({ scratch }) => {
  const result = pass(pdCitationIntegrity, scratch, {
    [PD_ACTIVE]: "| PD-1 | active |\n",
    [PD_CLEARED]: "| PD-2 | cleared |\n",
    "packages/server/src/x.ts": "// FLAG[PD-1]\nexport const x = 1;\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "population", source: "pd-registry-documents", members: 2, unresolved: 0 },
      { kind: "resource", source: "ledger:core-audits-debt", resources: 2, unresolved: 0 },
    ],
  ]);
});

test("pd-citation-integrity: ONE missing ledger half refuses the whole identity — reading half a registry is how a LIVE id reads as an orphan", ({
  scratch,
}) => {
  const result = pass(pdCitationIntegrity, scratch, { [PD_ACTIVE]: "| PD-1 | active |\n", "packages/server/src/x.ts": "// FLAG[PD-2]\nexport const x = 1;\n" });

  expect(refusalShape(result)).toEqual(refusal("pd-citation-integrity", "population", "resource declaration ledger:core-audits-debt is missing"));
});

test("dangling-doc-cite: a complete population reaches a verdict and files one receipt per declaration", ({ scratch }) => {
  const result = pass(danglingDocCite, scratch, {
    "knip.ts": "export const config = 1;\n",
    "docs/design/real.md": "planted.\n",
    "packages/kit/src/ok.ts": "// See docs/design/real.md for the ruling.\nexport const x = 1;\n",
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([
    [
      { kind: "population", source: "doc-citers", members: 2, unresolved: 0 },
      { kind: "resource", source: "authored-text#1", resources: 1, unresolved: 0 },
      { kind: "resource", source: "tracked-files", resources: 3, unresolved: 0 },
    ],
  ]);
});

test("dangling-doc-cite: a tracked inventory with NO root config and NO public asset is a REFUSAL, not a clean arm B", ({ scratch }) => {
  // The blindness tripwire. The legacy descriptor said this with a `line: 0` finding and guarded it on a
  // real-tree anchor so a mini-project would not false-fire it; a resource policy owns its whole
  // inventory, so it is a tool error with no guard.
  const result = pass(danglingDocCite, scratch, { "packages/kit/src/ok.ts": ANCHOR_TEXT });

  expect(refusalShape(result)).toEqual(refusal("dangling-doc-cite", "evaluate", "derived ZERO non-project files from the tracked inventory"));
});

test("dangling-doc-cite: an EMPTY arm-B member is a verdict, not the tool error every other refusal status raises", ({ scratch }) => {
  const result = pass(danglingDocCite, scratch, { "knip.ts": "", "packages/kit/src/ok.ts": ANCHOR_TEXT });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
