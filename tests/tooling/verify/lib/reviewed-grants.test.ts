// The central reviewed-grant table is judged against the FINAL roster on the tree: every row must name a
// loaded `reviewed-grant` policy with a nonblank identity and rationale, ids and identities must be unique,
// and the table must be deterministically ordered. Pre-cutover the roster is discovered here from every
// `defineGate` module because `loadPolicyCorpus` still refuses the mixed corpus by design.
import { globSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { ReviewedGateGrant, SelectedGatePolicy } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { isDefinedGatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { nodeTypesProof } from "../../../../tooling/src/verify/gates/_proof/node-types.ts";
import { gate as soleEnvReader } from "../../../../tooling/src/verify/gates/sole-env-reader.ts";
import { validateReviewedGrants } from "../../../../tooling/src/verify/lib/gate-authority-validation.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS, reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

// Importing every gate module once is the whole cost of this file; memoized so both roster tests pay it once.
let rosterOnce: Promise<ReadonlyMap<string, SelectedGatePolicy>> | undefined;
const ROSTER_TIMEOUT_MS = scaledBudget(120_000);

function finalRoster(repoRoot: string): Promise<ReadonlyMap<string, SelectedGatePolicy>> {
  rosterOnce ??= discoverFinalRoster(repoRoot);
  return rosterOnce;
}

async function discoverFinalRoster(repoRoot: string): Promise<ReadonlyMap<string, SelectedGatePolicy>> {
  const files = globSync("tooling/src/verify/gates/*.ts", { cwd: repoRoot }).sort();
  expect(files.length).toBeGreaterThan(0);
  const roster = new Map<string, SelectedGatePolicy>();
  for (const rel of files) {
    const module = (await import(pathToFileURL(join(repoRoot, rel)).href)) as Record<string, unknown>;
    const gate = module["gate"];
    if (isDefinedGatePolicy(gate)) {
      roster.set(gate.id, { id: gate.id, authority: gate.authority, severity: gate.severity });
    }
  }
  expect(roster.size).toBeGreaterThan(0);
  return roster;
}

test(
  "every reviewed grant validates against the final roster and the table is deterministic",
  async ({ repoRoot }) => {
    const roster = await finalRoster(repoRoot);
    const validated = validateReviewedGrants(REVIEWED_GRANTS, roster);
    expect(validated.errors).toEqual([]);
    expect(validated.grants).toHaveLength(REVIEWED_GRANTS.length);
    const keys = REVIEWED_GRANTS.map((grant) => `${grant.policyId} ${grant.id}`);
    expect(keys).toEqual([...keys].toSorted());
    for (const grant of REVIEWED_GRANTS) {
      expect(grant.id.startsWith(`${grant.policyId}:`)).toBe(true);
    }
  },
  ROSTER_TIMEOUT_MS,
);

test(
  "the validator is armed: a planted row naming an unknown policy is a tool error",
  async ({ repoRoot }) => {
    const roster = await finalRoster(repoRoot);
    const planted = { id: "no-such-policy:planted", policyId: "no-such-policy", subject: "x.ts", operation: "read", why: "planted", endsWhen: "never" };
    const validated = validateReviewedGrants([...REVIEWED_GRANTS, planted], roster);
    expect(validated.errors).toMatchObject([{ kind: "invalid-grant", grantId: planted.id, policyId: planted.policyId }]);
    expect(validated.grants).toHaveLength(REVIEWED_GRANTS.length);
  },
  ROSTER_TIMEOUT_MS,
);

test("reviewedGrantsFor narrows the table to a hand-picked roster", () => {
  expect(reviewedGrantsFor([])).toEqual([]);
  expect(reviewedGrantsFor(REVIEWED_GRANTS.map(({ policyId }) => ({ id: policyId })))).toEqual(REVIEWED_GRANTS);
});

function passFor(policy: GatePolicy, files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[]): ReturnType<typeof runPolicyPass> {
  const root = "/launch-exact-grants";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  return runPolicyPass({
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    knownPolicies: [policy],
    policies: [policy],
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("the launcher provenance key belongs only to the actual sole env home", () => {
  const home = "packages/server/src/foundation/env/index.ts";
  const foreign = "packages/server/src/domain/plugin/substrate/foreign-env.ts";
  const read = 'import process from "node:process";\nexport const source = process.env.ORB_ENV_FROM_FILE;\n';
  const files = { ...nodeTypesProof(), [home]: read, [foreign]: read };
  const grants = REVIEWED_GRANTS.filter((grant) => grant.id === "sole-env-reader:env-home-orb-env-from-file");
  expect(grants).toHaveLength(1);
  const raw = passFor(soleEnvReader, files, []);
  expect(raw.toolErrors).toEqual([]);
  expect(raw.authority.effectiveFindings.map((finding) => finding.subject).toSorted((left = "", right = "") => left.localeCompare(right))).toEqual(
    [home, foreign].toSorted((left = "", right = "") => left.localeCompare(right)),
  );
  const admitted = passFor(soleEnvReader, files, grants);
  expect(admitted.toolErrors).toEqual([]);
  expect(admitted.authority.grantedFindings).toHaveLength(1);
  expect(admitted.authority.effectiveFindings.map((finding) => finding.subject)).toEqual([foreign]);
  expect(admitted.authority.authorityAlarms).toEqual([]);
});
