// Conformance entry for the seven client-side policies whose only missing primitive was canonical
// symbol/member origin. Every proof runs through the production dispatcher on an isolated population.

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";

import { gate as noManualTokenEstimate } from "../../../../tooling/src/verify/gates/no-manual-token-estimate.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the canonical-origin client policies keep their founding, respelling and nearest-legal fixtures", () => {
  expect(verifyPolicyProofs([noManualTokenEstimate])).toEqual([]);
}, 240_000);

const ROOT = "/origin-client-family";

function passOf(policy: Parameters<typeof runPolicyPass>[0]["policies"][number], files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

// #1990/D5 — the third sibling with this exact contract had no pin at all: the audit measured both sides
// by hand and the tripwire works, but nothing in a committed test proved it. Copied from the two above.
test("the token-estimator home is a blindness tripwire on the same contract", () => {
  const healthy = passOf(noManualTokenEstimate, {
    "packages/kit/src/tokens/index.ts": "export function estimateTokens(text: string): number {\n  return text.length / 4;\n}\n",
    "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 4;\n",
  });
  expect(healthy.toolErrors).toEqual([]);
  expect(healthy.authority.effectiveFindings).toMatchObject([{ policyId: "no-manual-token-estimate" }]);
  expect(healthy.policies[0]?.receipts).toEqual([{ kind: "population", source: "estimateTokens", members: 1, unresolved: 0 }]);

  // The home file still exists but no longer exports `estimateTokens` — the exact shape of a rename.
  const renamed = passOf(noManualTokenEstimate, {
    "packages/kit/src/tokens/index.ts": "export function estimateChars(text: string): number {\n  return text.length / 4;\n}\n",
    "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 4;\n",
  });
  expect(renamed.toolErrors).toMatchObject([{ policyId: "no-manual-token-estimate", phase: "receipt", message: expect.stringContaining("estimateTokens") }]);
  expect(renamed.authority.withheldPolicyIds).toEqual(["no-manual-token-estimate"]);
  expect(renamed.authority.effectiveFindings).toEqual([]);
});
