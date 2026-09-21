import process from "node:process";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as seals } from "../../../../tooling/src/verify/gates/query-machine-seals.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/query-machine-seals-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [seals, health] as const;
const GRANTS: readonly ReviewedGateGrant[] = reviewedGrantsFor(POLICIES);
// Sorted by id, and COMPARED sorted (#2497): the central table's row order is an artifact of which
// `reviewed-grants-*.ts` shard holds a row, not a property of this family — the 450-line splits moved
// these three past each other. The set still catches an added, dropped or re-pointed row.
const EXPECTED_GRANT_IDENTITIES = [
  ["query-machine-seals:create-collection-surface", "packages/client/src/data/create-collection-surface.ts", "raw-useInfiniteQuery-import"],
  ["query-machine-seals:create-entity-mutation", "packages/client/src/data/create-entity-mutation.ts", "raw-useMutation-import"],
  ["query-machine-seals:ct-stories", "tests/client/lib/_ct-stories.tsx", "raw-useMutation-import"],
] as const;

test("both query-machine owners pass their declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("the three production candidates bind only their exact hook and home", () => {
  const byText = (left: string, right: string): number => left.localeCompare(right);
  expect(GRANTS.map(({ id, subject, operation }) => [id, subject, operation].join("|")).toSorted(byText)).toEqual(
    EXPECTED_GRANT_IDENTITIES.map((identity) => identity.join("|")).toSorted(byText),
  );
  const project = getWorkspace({ root: process.cwd() });
  const result = runPolicyPass({ knownPolicies: POLICIES, policies: POLICIES, root: process.cwd(), project, reviewedGrants: GRANTS, failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(
    result.policies
      .find(({ id }) => id === seals.id)
      ?.findings.map(({ subject, operation }) => ({ subject, operation }))
      .toSorted((a, b) => (a.subject ?? "").localeCompare(b.subject ?? "")),
  ).toEqual(GRANTS.map(({ subject, operation }) => ({ subject, operation })).toSorted((a, b) => a.subject.localeCompare(b.subject)));
  const owners: readonly GateOwnerResult[] = result.policies.map((policy) => ({
    policyId: policy.id,
    populationFiles: policy.population.effectiveSourcePaths,
    owner: policy.owner,
    findings: policy.findings,
  }));
  const reconcile = (rows: readonly ReviewedGateGrant[], changed = owners): ReturnType<typeof coordinateGateAuthority> =>
    coordinateGateAuthority({
      knownPolicies: POLICIES,
      selectedPolicies: POLICIES,
      ordinaryWaiverSources: [],
      ownerResults: changed,
      reviewedGrants: rows,
      failOnWarnings: false,
    });
  expect(
    reconcile(
      // BY ID, never by index (#2497): the central table's row order shifted under the 450-line splits and
      // index 0 became the row whose real operation ALREADY is `raw-useInfiniteQuery-import`, so the
      // "wrong key" mangle was a no-op and this arm silently proved one binding failure instead of two.
      GRANTS.map((grant) => {
        if (grant.id === "query-machine-seals:create-entity-mutation") {
          return { ...grant, operation: "raw-useInfiniteQuery-import" };
        }
        if (grant.id === "query-machine-seals:create-collection-surface") {
          return { ...grant, subject: `${grant.subject}:wrong` };
        }
        return grant;
      }),
    ).effectiveFindings,
  ).toHaveLength(2);
  expect(
    reconcile(
      GRANTS,
      owners.map((owner) => ({ ...owner, findings: owner.findings.flatMap((finding) => [finding, finding]) })),
    ).authorityAlarms.map(({ kind }) => kind),
  ).toEqual(["over-broad-reviewed-grant", "over-broad-reviewed-grant", "over-broad-reviewed-grant"]);
  expect(
    reconcile(
      GRANTS,
      owners.map((owner) => ({ ...owner, findings: [] })),
    ).authorityAlarms.map(({ kind }) => kind),
  ).toEqual(["stale-reviewed-grant", "stale-reviewed-grant", "stale-reviewed-grant"]);
}, 300_000);
