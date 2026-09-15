import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as pointerOutside } from "../../../../tooling/src/verify/gates/no-pointer-variants-in-features.ts";
import { gate as zOutside } from "../../../../tooling/src/verify/gates/no-raw-z-index.ts";
import { gate as pointerHealth } from "../../../../tooling/src/verify/gates/pointer-capability-tier-health.ts";
import { gate as pointerPermission } from "../../../../tooling/src/verify/gates/pointer-capability-tier-permission.ts";
import { gate as skinHealth } from "../../../../tooling/src/verify/gates/skin-fragment-tier-health.ts";
import { gate as skinPermission } from "../../../../tooling/src/verify/gates/skin-fragment-tier-permission.ts";
import { gate as skinOutside } from "../../../../tooling/src/verify/gates/ui-skin-fragment-purity.ts";
import { gate as zHealth } from "../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { gate as zPermission } from "../../../../tooling/src/verify/gates/z-index-tier-permission.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/ui-tier-family";
const ALL = [zOutside, zPermission, zHealth, skinOutside, skinPermission, skinHealth, pointerOutside, pointerPermission, pointerHealth];
const SKIN = [skinOutside, skinPermission, skinHealth];

function run(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  grants: readonly ReviewedGateGrant[] = reviewedGrantsFor(policies),
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: policies,
    policies,
    root: ROOT,
    project,
    reviewedGrants: grants,
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("the complete converted family proof corpus dispatches through production", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

test("a live reviewed home grants once at zero and many raw hits while an outside twin remains effective", () => {
  for (const homeSource of ["export const clean = true;", 'export const a = "bg-backdrop"; export const b = "focus-visible:ring-2";']) {
    const result = run(SKIN, {
      "packages/ui/src/lib/fragments.ts": homeSource,
      "packages/ui/src/primitives/outside.ts": 'export const outside = "bg-backdrop";',
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.grantedFindings).toHaveLength(1);
    expect(result.authority.effectiveFindings.filter(({ policyId }) => policyId === skinOutside.id)).toHaveLength(1);
  }
});

test("missing or changed reviewed home identity stays hard and stales the central grant", () => {
  const missing = run(SKIN, { "packages/ui/src/primitives/x.ts": "export const x = true;" });
  expect(missing.authority.effectiveFindings.some(({ policyId }) => policyId === skinHealth.id)).toBe(true);
  expect(missing.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");

  const [grant] = reviewedGrantsFor([skinPermission]);
  const changed = grant === undefined ? [] : [{ ...grant, subject: "packages/ui/src/lib-renamed/" }];
  const changedResult = run([skinPermission], { "packages/ui/src/lib/x.ts": "export const x = true;" }, changed);
  expect(changedResult.authority.authorityAlarms.map(({ kind }) => kind)).toContain("stale-reviewed-grant");
});

test("health findings anchor inside their owner when the shared fact also admits the other world", () => {
  for (const [policy, files] of [
    [
      skinHealth,
      {
        "packages/client/src/a.ts": "export const client = true;",
        "packages/ui/src/primitives/x.ts": "export const ui = true;",
      },
    ],
    [
      pointerHealth,
      {
        "packages/ui/src/a.ts": "export const ui = true;",
        "packages/client/src/main.ts": "export const client = true;",
      },
    ],
  ] as const) {
    const result = run([policy], files, []);
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toHaveLength(1);
    expect(result.authority.effectiveFindings[0]?.policyId).toBe(policy.id);
  }
});

test("a narrowed request defers every whole-population owner", () => {
  const files = { "packages/ui/src/lib/x.ts": "export const x = true;", "packages/ui/src/primitives/y.ts": "export const y = true;" };
  for (const policy of SKIN) {
    const result = run([policy], files, reviewedGrantsFor([policy]), ["packages/ui/src/primitives/y.ts"]);
    expect(result.policies.find(({ id }) => id === policy.id)?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  }
});
