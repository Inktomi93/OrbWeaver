// The CT config mirrors are hand-authored test composition roots. This pin drives their parity policy
// through the production proof dispatcher and separately proves filesystem discovery sees the policy.

import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import { gate } from "../../../../tooling/src/verify/gates/ct-config-mirror-parity.ts";
import { loadGateCorpus } from "../../../../tooling/src/verify/lib/loader.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { assertRealCorpusLivenessArms } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");
const CONFIG_MIRROR_FILES = [
  "packages/client/src/compose/config-sections.ts",
  "packages/client/src/compose/authed-app.tsx",
  "tests/support/browser/ct-data-providers.tsx",
  "tests/support/browser/ct-config-groups.ts",
];

test("ct config mirror parity keeps missing, extra, duplicate, wrong-anchor and group controls", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the production loader dispatches ct-config-mirror-parity", async ({ repoRoot }) => {
  const corpus = await loadGateCorpus(repoRoot);
  expect(corpus.gates.some((policy) => policy.id === gate.id)).toBe(true);
});

test("the checked-in production and CT config compositions have equal multisets", { timeout: scaledBudget(20_000) }, ({ repoRoot }) => {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: repoRoot,
    project: getWorkspace({ root: repoRoot }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
});

test("ct-config-mirror-parity bites on its real four-file corpus", { timeout: scaledBudget(120_000) }, () => {
  const fired = assertRealCorpusLivenessArms(REPO_ROOT, [
    {
      policy: gate,
      globs: CONFIG_MIRROR_FILES,
      overlays: [
        {
          kind: "neutralise",
          path: "tests/support/browser/ct-data-providers.tsx",
          source: 'const realSettingsSections = createContributorRegistry("config-sections", []);\n',
        },
      ],
      messageIncludes: "Section differences:",
      types: true,
    },
  ]);
  expect([...fired.keys()], "the declared liveness arm ran and reported").toEqual([gate.id]);
});
