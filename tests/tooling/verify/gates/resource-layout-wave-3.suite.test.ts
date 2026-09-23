import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as verifyRegistryParity } from "../../../../tooling/src/verify/gates/verify-registry-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REGISTRY } from "../../../../tooling/src/verify/lib/registry.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const policies = [verifyRegistryParity] as const;

test("third resource layout policy keeps its two-sided proofs", () => {
  expect(verifyPolicyProofs(policies)).toEqual([]);
});

/** The §4.5 REFUSAL PINS for this module's one declared resource (`package-metadata:root`), owed by
 *  `docs/law/resource-policy-contract.md` §3.6 — one pin per declared resource per REACHABLE non-ready status —
 *  and missing until 2026-09-13 (#2327, the `policy-refusal-coverage` warning debt).
 *
 *  NO PROOF ROW CAN CARRY THESE. `resolveResourceDeclarations` throws in the POPULATION phase, before
 *  `create` runs, so the owner is withheld and the run surfaces a TOOL ERROR; the conformance runner's
 *  `toolFailure` precedes any arm verdict, which is exactly the §4.5b case the family test owns.
 *
 *  THE STATUSES ARE DERIVED FROM THIS RESOURCE'S OWN READER, not from a generic roster:
 *  `ops/resource-config.ts#loadPackageMetadata` returns whatever `ResourceReader.read` gave it when that is
 *  not ready — `missing` for an absent path and `empty` for a zero-byte one (`ops/resource-reader.ts#read`
 *  answers `empty` on `value.length === 0` BEFORE any parse, so it can never collapse into the malformed
 *  pin) — and mints `unresolved` itself for a JSON parse failure and for a payload the closed
 *  `PackageMetadata` contract does not model. Both `unresolved` CAUSES are pinned rather than one, because
 *  the second is the one this module is exposed to: it reads `scripts`, and a `scripts` map whose values are
 *  not all strings is the shape a hand-edited manifest produces.
 *
 *  Each refusal is two-sided against the healthy twin below, which is the same overlay with the manifest
 *  intact: it reaches a verdict AND files the one `kind: "resource"` receipt with `unresolved: 0`, so a
 *  declaration that stopped being consumed reads here as a missing receipt rather than as a quiet pass. */
function parityPass(scratch: string, overlay: Readonly<Record<string, string>>): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [verifyRegistryParity],
    policies: [verifyRegistryParity],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

/** The four facts that together say "this run is not a verdict" rather than "the tree is clean", read as
 *  one object so a refusal that drifted on ONE axis (a finding leaking through, an owner completing) fails
 *  with the whole shape in the diff. Same shape as `resource-layout-wave-1.suite.test.ts`'s. */
function refusalShape(result: PolicyPassResult): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    toolErrors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owners: result.policies.map(({ id, owner }) => [id, owner.status]),
    withheld: result.authority.withheldPolicyIds,
  };
}

function populationRefusal(fragment: string): Record<string, unknown> {
  return {
    findings: [],
    toolErrors: [{ policyId: "verify-registry-parity", phase: "population", message: expect.stringContaining(fragment) }],
    owners: [["verify-registry-parity", "incomplete"]],
    withheld: ["verify-registry-parity"],
  };
}

/** Any passing root-resource proof must contain every registered script and every non-stage exception:
 *  the policy checks both sets unconditionally. The proof suite above establishes that contract; the
 *  healthy-twin test below checks it again through this family driver. Thus any such proof supplies the
 *  complete membership, independent of row order or why text, without a second hand-maintained roster.
 *  Only the input is reused: each regression keeps its own independent finding expectations. */
function manifest(extraScripts: Readonly<Record<string, string>>): string {
  const healthy = verifyRegistryParity.mustPass.at(0);
  if (healthy === undefined) {
    throw new Error("verify-registry-parity has no healthy root-manifest proof");
  }
  const base = JSON.parse(healthy.files["package.json"]) as { name: string; scripts: Record<string, string> };
  return JSON.stringify({ ...base, scripts: { ...base.scripts, ...extraScripts } });
}

test("verify-registry-parity: a MISSING root manifest refuses at the population phase rather than passing over no scripts", ({ scratch }) => {
  const result = parityPass(scratch, {});

  expect(refusalShape(result)).toEqual(populationRefusal("resource declaration package-metadata:root is missing"));
});

test("verify-registry-parity: an EMPTY root manifest refuses with its own status word, not the malformed one", ({ scratch }) => {
  const result = parityPass(scratch, { "package.json": "" });

  expect(refusalShape(result)).toEqual(populationRefusal("resource declaration package-metadata:root is empty"));
});

test("verify-registry-parity: a MALFORMED root manifest refuses as unresolved", ({ scratch }) => {
  const result = parityPass(scratch, { "package.json": '{"name":' });

  expect(refusalShape(result)).toEqual(populationRefusal("resource declaration package-metadata:root is unresolved: malformed package metadata"));
});

test("verify-registry-parity: a `scripts` map that is not all strings is the OTHER unresolved cause — this module's own exposure", ({ scratch }) => {
  const result = parityPass(scratch, { "package.json": '{"name":"orbweaver","scripts":{"check":["x"]}}' });

  expect(refusalShape(result)).toEqual(
    populationRefusal("resource declaration package-metadata:root is unresolved: package metadata does not match the closed root package contract"),
  );
});

test("verify-registry-parity: the healthy twin reaches a verdict on the SAME substrate and files one receipt per declaration", ({ scratch }) => {
  const result = parityPass(scratch, { "package.json": manifest({}) });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([[{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }]]);
});

test("verify-registry-parity: the twin's silence is a READ, not an empty denominator — one unregistered script and it accuses", ({ scratch }) => {
  // The control for the control: the healthy manifest plus ONE verification-shaped script with no registry
  // tier. Without this the clean twin above could be green because the policy never looked.
  const result = parityPass(scratch, {
    "package.json": manifest({ "test:visual-regression": "playwright test" }),
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: "verify-registry-parity" }]);
});

test("verify-registry-parity: deleting verify cannot hide missing stages or root runtime dependencies", ({ scratch }) => {
  const base = JSON.parse(manifest({})) as { name: string; scripts: Record<string, string> };
  const stage = REGISTRY.find((entry) => entry.argv[0] === "pnpm" && typeof entry.argv[1] === "string")?.argv[1];
  if (stage === undefined) {
    throw new Error("the verification registry has no pnpm script stage");
  }
  const scripts = Object.fromEntries(Object.entries(base.scripts).filter(([name]) => name !== "verify" && name !== stage));
  const result = parityPass(scratch, {
    "package.json": JSON.stringify({ ...base, scripts, dependencies: { "fixture-runtime-dep": "1" } }),
  });

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(3);
  expect(result.authority.effectiveFindings.map(({ message }) => message)).toEqual(
    expect.arrayContaining([
      'stale NON_STAGE_ALLOWLIST entry "verify": package.json has no such script — remove the exception from verify-registry-parity.ts or restore the script.',
      `the \`pnpm verify\` registry names a stage \`pnpm ${stage}\` but package.json has no "${stage}" script — remove the registry row or restore the script (tooling/src/verify/lib/registry.ts).`,
      expect.stringContaining('declares a runtime dependency "fixture-runtime-dep"'),
    ]),
  );
});
