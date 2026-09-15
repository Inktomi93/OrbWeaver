import { join } from "node:path";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/appearance-carrier-contract.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/appearance-carrier-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function projectFor(root: string, files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(join(root, path), text);
  }
  return project;
}

test("preserves all declared appearance controls through final dispatch", () => {
  expect(verifyPolicyProofs([gate, health])).toEqual([]);
});

test("an exact empty-carrier waiver cannot suppress independent graph health or survive a removed occurrence", () => {
  const manifest = "packages/client/src/lib/appearance-carrier-manifest.ts";
  const files = { ...gate.mustFlag[0].files };
  const original = files[manifest];
  expect(original).toBeDefined();
  const drive = (text: string): ReturnType<typeof runPolicyPass> => {
    const root = "/appearance-authority";
    return runPolicyPass({
      root,
      project: projectFor(root, { ...files, [manifest]: text }),
      knownPolicies: [gate, health],
      policies: [gate, health],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  };
  const bare = drive(original);
  const marked = drive(original.replace("={width:", "={\n// @orb-waive appearance-carrier-contract(width): isolated carrier probe\nwidth:"));
  expect(marked.toolErrors).toEqual([]);
  expect(marked.factErrors).toEqual([]);
  expect(marked.authority.waivedFindings.map(({ finding }) => finding.policyId)).toEqual([gate.id]);
  expect(marked.authority.effectiveFindings.filter(({ policyId }) => policyId === health.id)).toEqual(
    bare.authority.effectiveFindings.filter(({ policyId }) => policyId === health.id),
  );
  const stale = drive(
    original
      .replace("carriers:[]", 'carriers:["shell-grid"]')
      .replace("={width:", "={\n// @orb-waive appearance-carrier-contract(width): isolated carrier probe\nwidth:"),
  );
  expect(stale.authority.waivedFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.some(({ policyId }) => policyId === gate.id)).toBe(true);
});

test("the former real-tree planted manifest remains covered and invocation state does not leak", () => {
  const root = "/appearance-planted";
  const base = health.mustPass[0].files;
  const path = "packages/client/src/lib/__g_appearance-carrier-manifest.ts";
  const source =
    'const C={file:"packages/client/src/lib/__g_appearance-carrier-manifest.ts",symbol:"AppShell"};\nexport const APPEARANCE_CARRIER_MANIFEST={density:{owner:"sizing",carriers:["theme-scope"],consumer:C,lifecycle:"hydrated-from-prepaint-hint",portal:"shared-theme-scope-sibling",requiredDistinctArms:["compact","compact"]}};\nexport function AppShell(){ const density = "compact"; return density; }\n';
  const drive = (files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      root,
      project: projectFor(root, files),
      knownPolicies: [gate, health],
      policies: [gate, health],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const planted = drive({ ...base, [path]: source });
  expect(planted.toolErrors).toEqual([]);
  expect(planted.factErrors).toEqual([]);
  expect(planted.authority.effectiveFindings.map(({ message }) => message)).toEqual(["required-distinct arms for density are equal or malformed"]);
  const next = drive({ ...base, "packages/server/src/lib/__g_appearance-carrier-manifest.ts": source });
  expect(next.toolErrors).toEqual([]);
  expect(next.factErrors).toEqual([]);
  expect(next.authority.effectiveFindings).toEqual([]);
});
