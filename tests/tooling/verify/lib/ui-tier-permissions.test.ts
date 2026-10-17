import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as zOutside } from "../../../../tooling/src/verify/gates/no-raw-z-index.ts";
import { gate as zHealth } from "../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { gate as zPermission } from "../../../../tooling/src/verify/gates/z-index-tier-permission.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { Z_TOKEN_NAMES } from "../../../../tooling/src/verify/lib/ui-tier-permissions.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/ui-tier-family";
const ALL = [zOutside, zPermission, zHealth];

function run(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  grants: readonly ReviewedGateGrant[] = reviewedGrantsFor(policies),
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith(".json")) {
      project.createSourceFile(`${ROOT}/${path}`, source);
    }
  }
  return runPolicyPass({
    knownPolicies: policies,
    policies,
    root: ROOT,
    project,
    resourceOptions: { overlay: files },
    reviewedGrants: grants,
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("the complete converted family proof corpus dispatches through production", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

test("the retained z-index provider keeps raw carrier and semantic token scopes", () => {
  const result = run(
    [zOutside],
    {
      "packages/client/src/control.tsx":
        'export const raw = <div className="z-50" />; export const inert = "z-50"; export const semantic = "z-(--z-sticky)"; export const governed = "z-(--z-base)";',
    },
    [],
  );
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(['"z-50"', "z-"]);
});

test("the retained z-index homes grant once at zero and many raw hits", () => {
  for (const source of ["export const clean = true;", 'export const x = <div className="z-50 z-[60]" />;']) {
    const result = run([zPermission], {
      "packages/ui/src/layout/control.tsx": source,
      "packages/ui/src/markdown/control.tsx": source,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.grantedFindings).toHaveLength(2);
    expect(result.authority.effectiveFindings).toEqual([]);
    expect(result.authority.authorityAlarms).toEqual([]);
  }
});

test("a narrowed request defers every surviving whole-population owner", () => {
  const files = {
    "packages/ui/src/layout/x.ts": "export const x = true;",
    "packages/ui/src/markdown/x.ts": "export const x = true;",
    "packages/ui/src/primitives/y.ts": "export const y = true;",
    "packages/ui/src/tokens/tokens.json": JSON.stringify({ z: Object.fromEntries(Z_TOKEN_NAMES.map((name) => [name, {}])) }),
  };
  for (const policy of ALL) {
    const result = run([policy], files, reviewedGrantsFor([policy]), ["packages/ui/src/primitives/y.ts"]);
    expect(result.policies.find(({ id }) => id === policy.id)?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  }
});
