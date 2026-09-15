// Final gate-ignore residue policy: dispatcher-owned historical grammar and the complete frozen Phase-F differential.
import { Project } from "ts-morph";
import { gate as gateIgnoreInventory } from "../../../../tooling/src/verify/gates/gate-ignore-inventory.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/gate-ignore-inventory-family";

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [gateIgnoreInventory],
    policies: [gateIgnoreInventory],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("every final gate-ignore proof row holds through production dispatch", () => {
  expect(verifyPolicyProofs([gateIgnoreInventory])).toEqual([]);
});

test("a narrowed request defers the entire-population residue owner", () => {
  const result = passOf(
    {
      "packages/ui/src/x/marker.ts": "// @orb-gate-ignore old-gate: retired residue\nexport const marker = 1;\n",
      "packages/ui/src/x/clean.ts": "export const clean = true;\n",
    },
    ["packages/ui/src/x/clean.ts"],
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.map(({ owner }) => owner)).toMatchObject([{ status: "not-applicable", population: "complete" }]);
});

test("the showcase workspace remains inside the retired-marker population", () => {
  const path = "packages/showcase-plugins/src/index.ts";
  const result = passOf({ [path]: "// @orb-gate-ignore old-gate: showcase residue\nexport const plugin = true;\n" });
  expect(result.policies[0]?.population.effectiveSourcePaths).toEqual([path]);
  expect(result.authority.effectiveFindings).toMatchObject([
    {
      file: path,
      line: 1,
      column: 1,
      token: "old-gate",
      message: gateIgnoreInventory.message,
      fix: gateIgnoreInventory.fix,
      policyId: gateIgnoreInventory.id,
    },
  ]);
});
