// §4.5 refusal pin for the two `-health` tripwires (`spacing-tier-home-health`, `typography-tier-home-health`).
// Neither has a family test today (v-audit-wave4-2026-09-12.md, D8): both declare
// `execution: "entire-population"` because "does this row resolve to a file" is a whole-tree question the
// per-file occurrence policy cannot answer, but nothing proved a NARROWED request defers instead of
// silently declaring both sanctioned homes dead. The generic deferral mechanics are the planner's own
// contract (`tests/tooling/verify/lib/policy-plan.test.ts`); this pins it for these two real policies, the
// same shape as `no-tailwind-dark-variant.int.test.ts`'s "a narrowed request defers" test.
import { Project } from "ts-morph";
import { gate as spacingTierHealth } from "../../../../tooling/src/verify/gates/spacing-tier-home-health.ts";
import { gate as typographyTierHealth } from "../../../../tooling/src/verify/gates/typography-tier-home-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/tier-home-health";
const ANCHOR = "packages/ui/src/tokens/index.ts";
const FAMILY = [spacingTierHealth, typographyTierHealth];

test("both -health tripwires preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

test("a narrowed request defers the entire-population tripwire instead of declaring every home dead", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const files: Readonly<Record<string, string>> = {
    [ANCHOR]: "export const tokens = {};\n",
    "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
    "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
  };
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  for (const policy of FAMILY) {
    // A run over the WHOLE project reports nothing (both homes resolve) — the control this pin depends on.
    const whole = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
    expect(whole.toolErrors).toEqual([]);
    expect(whole.policies.find(({ id }) => id === policy.id)?.findings).toEqual([]);

    // A request narrowed to ONE file must not partially run the tripwire and "discover" the other home
    // dead — it must DEFER, exactly like `no-tailwind-dark-variant`'s pin for the same `execution` value.
    const narrowed = runPolicyPass({
      knownPolicies: [policy],
      policies: [policy],
      root: ROOT,
      project,
      requestedPaths: [ANCHOR],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(narrowed.toolErrors).toEqual([]);
    const owner = narrowed.policies.find(({ id }) => id === policy.id);
    expect(owner?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(owner?.findings).toEqual([]);
  }
});
