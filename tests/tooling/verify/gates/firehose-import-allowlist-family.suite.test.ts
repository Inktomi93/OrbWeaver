import process from "node:process";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as firehose } from "../../../../tooling/src/verify/gates/firehose-import-allowlist.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { authorityOwnerResult } from "../../../../tooling/src/verify/lib/policy-pass-receipts.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES: readonly GatePolicy[] = [firehose, health];
const BARREL = "packages/server/src/transport/trpc/index.ts";
const DEFINITION = "packages/server/src/transport/trpc/chat-events-bus.ts";

function firehoseGrants(): readonly ReviewedGateGrant[] {
  return reviewedGrantsFor(POLICIES);
}

test("the D162 reference and rename-health owners pass every declared proof", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("the production composition-root and barrel references are exactly the two grant candidates", () => {
  const root = process.cwd();
  const grants = firehoseGrants();
  expect(grants.map(({ id, policyId, subject, operation }) => ({ id, policyId, subject, operation }))).toEqual([
    {
      id: "firehose-import-allowlist:automation-watcher",
      policyId: "firehose-import-allowlist",
      subject: "packages/server/src/entry/compose/automation-watcher.ts",
      operation: "all-chat-firehose-reference",
    },
    {
      id: "firehose-import-allowlist:transport-barrel",
      policyId: "firehose-import-allowlist",
      subject: BARREL,
      operation: "all-chat-firehose-reference",
    },
  ]);
  const result = runPolicyPass({
    knownPolicies: POLICIES,
    policies: POLICIES,
    root,
    project: getWorkspace({ root }),
    reviewedGrants: grants,
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.authorityAlarms.filter((alarm) => alarm.kind !== "ordinary-waiver")).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.reviewedGrantConsumption).toEqual(grants.map(({ id }) => ({ id, count: 1 })));
  expect(result.policies[0]?.findings.map(({ subject }) => subject).toSorted()).toEqual(grants.map(({ subject }) => subject).toSorted());
  expect(result.policies[1]?.findings).toEqual([]);
  // The old definition-path regex was never a finding permission; declaration liveness now belongs to health.
  expect(result.policies[0]?.findings.some(({ subject }) => subject === DEFINITION)).toBe(false);
  const owners: readonly GateOwnerResult[] = result.policies.map(authorityOwnerResult);
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
  expect(stale.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant", "stale-reviewed-grant"]);
  const wrongKeys = reconcile(
    owners,
    grants.map((grant, index) => (index === 0 ? { ...grant, subject: `${grant.subject}:wrong` } : { ...grant, operation: `${grant.operation}:wrong` })),
  );
  expect(wrongKeys.grantedFindings).toEqual([]);
  expect(wrongKeys.effectiveFindings).toHaveLength(2);
  expect(wrongKeys.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["stale-reviewed-grant", "stale-reviewed-grant"]);
  const multiplied = reconcile(
    owners.map((owner) => ({ ...owner, findings: owner.findings.flatMap((finding) => [finding, finding]) })),
    grants,
  );
  expect(multiplied.authorityAlarms.map((alarm) => alarm.kind)).toEqual(["over-broad-reviewed-grant", "over-broad-reviewed-grant"]);
}, 300_000);
