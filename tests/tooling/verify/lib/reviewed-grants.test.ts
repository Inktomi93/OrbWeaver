// The central reviewed-grant table is judged against the FINAL roster on the tree: every row must name a
// loaded `reviewed-grant` policy with a nonblank identity and rationale, ids and identities must be unique,
// and the table must be deterministically ordered. Pre-cutover the roster is discovered here from every
// `defineGate` module because `loadPolicyCorpus` still refuses the mixed corpus by design.
import { globSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { SelectedGatePolicy } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { isDefinedGatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { validateReviewedGrants } from "../../../../tooling/src/verify/lib/gate-authority-validation.ts";
import { REVIEWED_GRANTS, reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// Importing every gate module once is the whole cost of this file; memoized so both roster tests pay it once.
let rosterOnce: Promise<ReadonlyMap<string, SelectedGatePolicy>> | undefined;
const ROSTER_TIMEOUT_MS = 120_000;

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
