// `caught-failure-census-row` on a NARROWED request: the staged-commit shape. The module's own rows prove the
// matcher on a whole mini-project; a row cannot request a subset, which is the property the pre-commit door needs
// (`verify --static --changed staged` hands the policy only the staged files).

import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate as censusRow } from "../../../../tooling/src/verify/gates/caught-failure-census-row.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/caught-failure-ownership-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/census-row";
const CENSUS = "tooling/src/verify/gates/caught-failure-ownership.population.json";
const STAGED = "packages/server/src/domain/probe/staged.ts";
const UNSTAGED = "packages/server/src/domain/probe/unstaged.ts";
const ABSORB = (name: string): string => `export function ${name}(): void {\n  try { risky(); } catch {}\n}\n`;
const STAGED_ID = `${STAGED}::staged::catch::1`;

function census(...siteIds: readonly string[]): string {
  return JSON.stringify({ rows: siteIds.map((siteId) => ({ siteId, verdict: "deliberate-absorb", reason: "probe" })) });
}

/** The messages the policy reported when only `requestedPaths` were handed to it. */
function narrowed(rows: readonly string[], requestedPaths: readonly string[]): readonly string[] {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${STAGED}`, ABSORB("staged"));
  project.createSourceFile(`${ROOT}/${UNSTAGED}`, ABSORB("unstaged"));
  const result = runPolicyPass({
    knownPolicies: [censusRow],
    policies: [censusRow],
    root: ROOT,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    requestedPaths,
    resourceOptions: { overlay: { [CENSUS]: census(...rows) } },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  return result.policies.flatMap((owner) => owner.findings.map((finding) => finding.message ?? ""));
}

test("both halves of the census join dispatch their own proof rows", () => {
  expect(verifyPolicyProofs([censusRow, health])).toEqual([]);
});

test("a staged file whose site has no row is named with the row to add", () => {
  const messages = narrowed([], [STAGED]);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain(`\`${STAGED_ID}\``);
  expect(messages[0]).toContain('"verdict": "deliberate-absorb"');
  // The unstaged file also lacks a row, but it is not part of this commit.
  expect(messages[0]).not.toContain(UNSTAGED);
});

test("adding the row clears the staged finding", () => {
  expect(narrowed([STAGED_ID], [STAGED])).toEqual([]);
});
