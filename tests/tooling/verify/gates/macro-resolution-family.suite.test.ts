import process from "node:process";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/macro-resolution-health.ts";
import { gate as home } from "../../../../tooling/src/verify/gates/macro-resolution-home.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES: readonly GatePolicy[] = [home, health];

test("the macro home and rename-health owners pass their declared production proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("the four central macro homes have exact production keys and bind once", () => {
  const grants = reviewedGrantsFor(POLICIES);
  expect(grants.map(({ id }) => id)).toEqual([
    "macro-resolution-home:ghost-message-row",
    "macro-resolution-home:message-content",
    "macro-resolution-home:message-render",
    "macro-resolution-home:message-row-parts",
  ]);
  expect(grants.every(({ operation }) => operation === "macro-resolution")).toBe(true);
  const result = runPolicyPass({
    knownPolicies: POLICIES,
    policies: POLICIES,
    root: process.cwd(),
    project: getWorkspace({ root: process.cwd() }),
    reviewedGrants: grants,
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.authorityAlarms.filter((alarm) => alarm.kind !== "ordinary-waiver")).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.reviewedGrantConsumption).toEqual(grants.map(({ id }) => ({ id, count: 1 })));
  const owners: readonly GateOwnerResult[] = result.policies.map((policy) => ({
    policyId: policy.id,
    populationFiles: policy.population.effectiveSourcePaths,
    owner: policy.owner,
    findings: policy.findings,
  }));
  const reconcile = (ownerResults: readonly GateOwnerResult[], rows: readonly ReviewedGateGrant[]): ReturnType<typeof coordinateGateAuthority> =>
    coordinateGateAuthority({
      knownPolicies: POLICIES,
      selectedPolicies: POLICIES,
      ordinaryWaiverSources: [],
      ownerResults,
      reviewedGrants: rows,
      failOnWarnings: false,
    });
  const stale = reconcile(
    owners.map((owner) => ({ ...owner, findings: [] })),
    grants,
  );
  expect(stale.authorityAlarms.map((alarm) => alarm.kind)).toEqual(Array.from({ length: 4 }, () => "stale-reviewed-grant"));
  const wrongKeys = reconcile(
    owners,
    grants.map((grant, index) => (index % 2 === 0 ? { ...grant, subject: `${grant.subject}:wrong` } : { ...grant, operation: `${grant.operation}:wrong` })),
  );
  expect(wrongKeys.grantedFindings).toEqual([]);
  expect(wrongKeys.effectiveFindings).toHaveLength(4);
  expect(wrongKeys.authorityAlarms.map((alarm) => alarm.kind)).toEqual(Array.from({ length: 4 }, () => "stale-reviewed-grant"));
  const multiplied = reconcile(
    owners.map((owner) => ({ ...owner, findings: owner.findings.flatMap((finding) => [finding, finding]) })),
    grants,
  );
  expect(multiplied.authorityAlarms.map((alarm) => alarm.kind)).toEqual(Array.from({ length: 4 }, () => "over-broad-reviewed-grant"));
}, 300_000);
