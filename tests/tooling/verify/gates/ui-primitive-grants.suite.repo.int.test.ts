// The eleven live permissions translated from the legacy UI primitive policy. The policies are dispatched once over
// the real checkout, then their production owner results drive the central authority coordinator's identity,
// stale, and multiplicity controls. No hand-written finding can make this test green.
import process from "node:process";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/ui-primitive-overlay-health.ts";
import { gate as permissions } from "../../../../tooling/src/verify/gates/ui-primitive-permissions.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/ui-primitive-structure.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const POLICIES: readonly GatePolicy[] = [ordinary, permissions, health];
const GRANT_COUNT = 11;
const BUDGET_MS = scaledBudget(300_000);

function authority(ownerResults: readonly GateOwnerResult[], reviewedGrants: readonly ReviewedGateGrant[]): ReturnType<typeof coordinateGateAuthority> {
  return coordinateGateAuthority({
    knownPolicies: POLICIES,
    selectedPolicies: POLICIES,
    ordinaryWaiverSources: [],
    ownerResults,
    reviewedGrants,
    failOnWarnings: false,
  });
}

const alarmIds = (result: ReturnType<typeof coordinateGateAuthority>, kind: "stale-reviewed-grant" | "over-broad-reviewed-grant"): readonly string[] =>
  result.authorityAlarms.flatMap((alarm) => (alarm.kind === kind ? [alarm.grantId] : [])).toSorted();

test(
  "all 11 real UI primitive grants bind once; wrong keys stale, missing findings stale, and duplicate findings are over-broad",
  () => {
    const root = process.cwd();
    const project = getWorkspace({ root });
    const grants = reviewedGrantsFor(POLICIES);
    expect(grants).toHaveLength(GRANT_COUNT);
    expect(grants.map(({ id }) => id)).toEqual(grants.map(({ id }) => id).toSorted());

    const dispatched = runPolicyPass({ knownPolicies: POLICIES, policies: POLICIES, root, project, reviewedGrants: [], failOnWarnings: false });
    expect(dispatched.factErrors).toEqual([]);
    expect(dispatched.toolErrors).toEqual([]);
    expect(dispatched.authority.toolErrors).toEqual([]);
    expect(dispatched.authority.withheldPolicyIds).toEqual([]);
    expect(dispatched.authority.effectiveFindings).toHaveLength(GRANT_COUNT);
    for (const policy of dispatched.policies) {
      expect(policy.owner.status, policy.id).toBe("success");
    }
    expect(dispatched.policies.filter((policy) => policy.id !== permissions.id).map((policy) => ({ id: policy.id, findings: policy.findings }))).toEqual(
      expect.arrayContaining([
        { id: ordinary.id, findings: [] },
        { id: health.id, findings: [] },
      ]),
    );

    const owners: readonly GateOwnerResult[] = dispatched.policies.map((policy) => ({
      policyId: policy.id,
      populationFiles: [...new Set([...policy.population.effectiveSourcePaths, ...policy.population.effectiveResourcePaths])].toSorted(),
      owner: policy.owner,
      findings: policy.findings,
    }));
    const expectedIds = grants.map(({ id }) => id).toSorted();

    const exact = authority(owners, grants);
    expect(exact.toolErrors).toEqual([]);
    expect(exact.effectiveFindings).toEqual([]);
    expect(exact.grantedFindings).toHaveLength(GRANT_COUNT);
    expect(exact.reviewedGrantConsumption).toEqual(expectedIds.map((id) => ({ id, count: 1 })));
    expect(exact.authorityAlarms).toEqual([]);

    const wrongOperation = authority(
      owners,
      grants.map((grant) => ({ ...grant, operation: `${grant.operation}:wrong` })),
    );
    expect(wrongOperation.toolErrors).toEqual([]);
    expect(wrongOperation.grantedFindings).toEqual([]);
    expect(wrongOperation.effectiveFindings).toHaveLength(GRANT_COUNT);
    expect(wrongOperation.authorityAlarms).toHaveLength(GRANT_COUNT);
    expect(alarmIds(wrongOperation, "stale-reviewed-grant")).toEqual(expectedIds);

    const wrongSubject = authority(
      owners,
      grants.map((grant) => ({ ...grant, subject: `${grant.subject}:wrong` })),
    );
    expect(wrongSubject.toolErrors).toEqual([]);
    expect(wrongSubject.grantedFindings).toEqual([]);
    expect(wrongSubject.effectiveFindings).toHaveLength(GRANT_COUNT);
    expect(wrongSubject.authorityAlarms).toHaveLength(GRANT_COUNT);
    expect(alarmIds(wrongSubject, "stale-reviewed-grant")).toEqual(expectedIds);

    const stopped = authority(
      owners.map((owner) => ({ ...owner, findings: [] })),
      grants,
    );
    expect(stopped.toolErrors).toEqual([]);
    expect(stopped.effectiveFindings).toEqual([]);
    expect(stopped.authorityAlarms).toHaveLength(GRANT_COUNT);
    expect(alarmIds(stopped, "stale-reviewed-grant")).toEqual(expectedIds);

    const multiplied = authority(
      owners.map((owner) => ({ ...owner, findings: owner.findings.flatMap((finding) => [finding, finding]) })),
      grants,
    );
    expect(multiplied.toolErrors).toEqual([]);
    expect(multiplied.grantedFindings).toEqual([]);
    expect(multiplied.effectiveFindings).toHaveLength(GRANT_COUNT * 2);
    expect(multiplied.authorityAlarms).toHaveLength(GRANT_COUNT);
    expect(alarmIds(multiplied, "over-broad-reviewed-grant")).toEqual(expectedIds);
  },
  BUDGET_MS,
);
