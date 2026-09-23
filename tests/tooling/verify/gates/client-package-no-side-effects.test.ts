// The committed receipt for `client-package-no-side-effects` (#1752, work item 0029): the declared rows, and
// the REAL client manifest judged both ways — as it stands (clean), and as a resource-overlay copy with a
// `sideEffects` field added (one finding at the manifest). Rows run on synthetic manifests, so only the
// real-tree pair proves the policy reads the file the bundler reads.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/client-package-no-side-effects.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const MANIFEST = "packages/client/package.json";

function pass(root: string, overlay: Readonly<Record<string, string>> = {}): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the declared rows hold", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the real client manifest is clean, and a copy that adds `sideEffects` is one finding naming it", ({ repoRoot }) => {
  const real = readFileSync(join(repoRoot, MANIFEST), "utf8");
  const clean = pass(repoRoot);
  expect(clean.toolErrors).toEqual([]);
  expect(clean.authority.effectiveFindings).toEqual([]);

  const withField = real.replace(/\{\n/u, '{\n  "sideEffects": ["**/*.css"],\n');
  expect(withField).not.toBe(real);
  const flagged = pass(repoRoot, { [MANIFEST]: withField });
  expect(flagged.toolErrors).toEqual([]);
  expect(flagged.authority.effectiveFindings.map((finding) => [finding.policyId, finding.file])).toEqual([["client-package-no-side-effects", MANIFEST]]);
});
