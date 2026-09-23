import process from "node:process";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as coverage } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { gate as debt } from "../../../../tooling/src/verify/gates/query-freshness-coverage-debt.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/query-freshness-coverage-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { authorityOwnerResult } from "../../../../tooling/src/verify/lib/policy-pass-receipts.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const POLICIES = [coverage, health, debt] as const;
const STATIC_SUBJECTS = [
  "assets.resolveBlobRefs",
  "assets.resolveChatBlobRefs",
  "chat.getVariantWire",
  "imagery.readProvenance",
  "search.search",
  "search.fields",
  "search.suggest",
  "chat.checkSendAvailability",
  "notifications.presence",
  "notifications.list",
  "workloads.list",
  "workloads.listSchedules",
  "admin.listUsers",
  "admin.listSessions",
  "settings.getAppSettingsWithOverrides",
  "settings.getVersion",
  "settings.checkForUpdate",
  "invites.listInvites",
  "rpg.listCheckpoints",
  "assets.listGallery",
  "assets.listOwned",
  "automation.listRules",
  "automation.listFires",
  "automation.listOwnerRules",
  "automation.getOwnerBudgets",
  "automation.listRulePresets",
  "plugin.list",
  "plugin.listSurfaces",
  "plugin.listCommands",
  "plugin.listDistributed",
  "plugin.listDisplayTransforms",
  "plugin.transformForDisplay",
  "plugin.listBundleAssets",
  "plugin.getLog",
] as const;

test("the coverage, blindness, and listChatActivity debt owners pass all declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("all 34 production classifications are exact central grants and the listChatActivity debt remains independently visible", () => {
  const grants = reviewedGrantsFor(POLICIES);
  expect(grants).toHaveLength(34);
  expect(grants.map(({ subject }) => subject).toSorted()).toEqual([...STATIC_SUBJECTS].toSorted());
  expect(grants.every(({ operation }) => operation === "uncovered-query-freshness")).toBe(true);
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
  expect(result.authority.authorityAlarms.filter(({ kind }) => kind !== "ordinary-waiver")).toEqual([]);
  expect(
    result.policies
      .find(({ id }) => id === coverage.id)
      ?.findings.map(({ subject }) => subject)
      .toSorted(),
  ).toEqual([...STATIC_SUBJECTS].toSorted());
  expect(result.policies.find(({ id }) => id === health.id)?.findings).toEqual([]);
  expect(result.policies.find(({ id }) => id === debt.id)?.findings).toHaveLength(1);
  expect(result.authority.reviewedGrantConsumption).toEqual(
    grants.map(({ id }) => ({ id, count: 1 })).toSorted((left, right) => left.id.localeCompare(right.id)),
  );
  const owners: readonly GateOwnerResult[] = result.policies.map(authorityOwnerResult);
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
      grants.map((grant, index) => {
        if (index === 0) {
          return { ...grant, subject: `${grant.subject}:wrong` };
        }
        if (index === 1) {
          return { ...grant, operation: `${grant.operation}:wrong` };
        }
        return grant;
      }),
    ).effectiveFindings,
  ).toHaveLength(3);
  const withoutCoverage = owners.map((owner) => (owner.policyId === coverage.id ? { ...owner, findings: [] } : owner));
  expect(reconcile(grants, withoutCoverage).authorityAlarms.map(({ kind }) => kind)).toEqual(Array.from({ length: 34 }, () => "stale-reviewed-grant"));
  const multiplied = owners.map((owner) =>
    owner.policyId === coverage.id ? { ...owner, findings: owner.findings.flatMap((finding) => [finding, finding]) } : owner,
  );
  expect(reconcile(grants, multiplied).authorityAlarms.map(({ kind }) => kind)).toEqual(Array.from({ length: 34 }, () => "over-broad-reviewed-grant"));
}, 300_000);
