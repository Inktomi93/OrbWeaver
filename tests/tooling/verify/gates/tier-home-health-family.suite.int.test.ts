// §4.5 refusal pin AND the §4.6 SPLIT-ARM DIFFERENTIAL for the two `-health` tripwires
// (`spacing-tier-home-health`, `typography-tier-home-health`).
//
// §4.5 (v-audit-wave4-2026-09-12.md, D8): both declare `execution: "entire-population"` because "does this
// row resolve to a file" is a whole-tree question the per-file occurrence policy cannot answer, but nothing
// proved a NARROWED request defers instead of silently declaring both sanctioned homes dead. The generic
// deferral mechanics are the planner's own contract (`tests/tooling/verify/lib/policy-plan.test.ts`); this
// pins it for these two real policies, the same shape as `no-tailwind-dark-variant.int.test.ts`'s test.
//
// §4.6 (#2000, p-parity-tier1): each `-health` policy exists BECAUSE one legacy gate was SPLIT into two
// policies with different `execution` values — the legacy `no-raw-spacing-in-features` /
// `no-raw-typography-in-features` descriptors carried the occurrence `visit` AND the rename tripwire in
// `finalize`. So the legacy gate's behaviour must now be reproduced by the UNION of the two final
// policies, and §4.6 requires a successor proof for the moved arm. This file is that proof: every original
// `mustFlag`/`mustPass` example from `d6f36904f` (the commit immediately before `99b7429e2` split them)
// replayed through the frozen legacy dispatcher and, byte-identically, through both final policies
// together.
//
// THE THREE CLASSIFIED DIFFERENCES, asserted rather than waved at:
//   1. SPLIT — one legacy gate, two final policies. The union is compared, never one half.
//   2. TRIPWIRE ANCHOR — the legacy `reportUnresolvedHomes` reported the stale-row verdict on line 1 of the
//      GATE MODULE ITSELF (`tooling/src/verify/gates/no-raw-*.ts`). That path is outside the final
//      policy's own `["@client","@ui"]` population, so `ctx.report.file` cannot express it; the health
//      policy anchors on its real-tree anchor (`packages/ui/src/tokens/index.ts`) instead. The trailing
//      "in <path>" of the message follows the same change (full repo path → module basename).
//   3. OCCURRENCE MESSAGE TEXT — reworded at conversion (#1954) from "in className" to "in a class string
//      (a `className` attribute or a `cn`/`clsx`/`cva`/`tv` call)", because the carrier fence admits the
//      class-composer call too and the old text claimed a context narrower than the visitor's. Both texts
//      are pinned verbatim below, so a FOURTH, unintended text drift reds this test.
// Everything else — which sites flag, at which position, with which token, and which sanctioned-home row
// the tripwire names — must be IDENTICAL.
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
