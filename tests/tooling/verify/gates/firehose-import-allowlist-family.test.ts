import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as firehose } from "../../../../tooling/src/verify/gates/firehose-import-allowlist.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = "197f938de";
const LEGACY_PATH = "tooling/src/verify/gates/firehose-import-allowlist.ts";
const ROOT = "/firehose-import-allowlist-family";
const POLICIES: readonly GatePolicy[] = [firehose, health];
const BARREL = "packages/server/src/transport/trpc/index.ts";
const DEFINITION = "packages/server/src/transport/trpc/chat-events-bus.ts";

function filesOf(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/server/src/example.ts"]: example.files } : example.files;
}

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function completedTwin(files: Readonly<Record<string, string>>, index: number): Readonly<Record<string, string>> {
  if (![0, 2, 3, 5].includes(index)) {
    return files;
  }
  return Object.fromEntries(
    Object.entries(files).map(([path, source]) => [path, source.replace('"../../transport/trpc"', '"../../transport/trpc/chat-events-bus.ts"')]),
  );
}

function finalPass(files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({ knownPolicies: POLICIES, policies: POLICIES, root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
}

function firehoseGrants(): readonly ReviewedGateGrant[] {
  return reviewedGrantsFor(POLICIES);
}

test("the D79 reference and rename-health owners pass every declared proof", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("all nine frozen D79 rows preserve exact import, re-export, namespace, negative, and rename behavior", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(9);
  const expectedLegacy = [1, 1, 1, 1, 1, 0, 0, 0, 0] as const;
  const expectedFinalRaw = [1, 1, 1, 1, 1, 1, 1, 0, 0] as const;
  const expectedFinalEffective = [1, 1, 1, 1, 1, 0, 0, 0, 0] as const;
  const grantSubjectByRow: Readonly<Record<number, string>> = {
    5: "packages/server/src/entry/compose/automation-watcher.ts",
    6: BARREL,
  };
  const legacyIdentities: string[][] = [];
  const firehoseIdentities: string[][] = [];
  const healthIdentities: string[][] = [];
  const centralGrants = firehoseGrants();

  for (const [index, example] of examples.entries()) {
    const expectedLegacyCount = expectedLegacy[index];
    const expectedFinalRawCount = expectedFinalRaw[index];
    const expectedFinalEffectiveCount = expectedFinalEffective[index];
    if (expectedLegacyCount === undefined || expectedFinalRawCount === undefined || expectedFinalEffectiveCount === undefined) {
      throw new Error(`unclassified firehose row ${index}`);
    }
    const raw = filesOf(example);
    const files = completedTwin(raw, index);
    const rawProject = projectOf(raw);
    const rawBefore = runPass([legacy], {
      root: ROOT,
      project: rawProject,
      scope: { kind: "project" },
      files: rawProject.getSourceFiles(),
      checker: () => rawProject.getTypeChecker(),
    });
    const project = projectOf(files);
    const before = runPass([legacy], {
      root: ROOT,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    expect(rawBefore.toolErrors, example.why).toEqual([]);
    expect(before.toolErrors, example.why).toEqual([]);
    expect(before.gates[0]?.findings, example.why).toEqual(rawBefore.gates[0]?.findings);
    expect(before.gates[0]?.findings, example.why).toHaveLength(expectedLegacyCount);
    expect(before.gates[0]?.scan.scanned, example.why).toBe(project.getSourceFiles().length);

    const grantSubject = grantSubjectByRow[index];
    const grants = grantSubject === undefined ? [] : centralGrants.filter(({ subject }) => subject === grantSubject);
    const after = finalPass(files, grants);
    expect(after.toolErrors, example.why).toEqual([]);
    expect(after.factErrors, example.why).toEqual([]);
    expect(
      after.policies.flatMap(({ findings }) => findings),
      example.why,
    ).toHaveLength(expectedFinalRawCount);
    expect(after.authority.effectiveFindings, example.why).toHaveLength(expectedFinalEffectiveCount);
    expect(after.policies[0]?.population.effectiveSourcePaths, example.why).toEqual(after.policies[1]?.population.effectiveSourcePaths);

    legacyIdentities.push(
      (before.gates[0]?.findings ?? []).map(({ file, line, token }) => `${file.replace(`${ROOT}/`, "")}:${line}:${token ?? "health"}`).toSorted(),
    );
    firehoseIdentities.push((after.policies[0]?.findings ?? []).map(({ file, line, token, subject }) => `${file}:${line}:${token}:${subject}`).toSorted());
    healthIdentities.push((after.policies[1]?.findings ?? []).map(({ file, line }) => `${file}:${line}`).toSorted());
  }
  expect(legacyIdentities).toEqual([
    ["packages/server/src/domain/buddy/observer.ts:1:subscribeAllChatEvents"],
    ["packages/server/src/infra/relay.ts:1:subscribeAllChatEvents"],
    ["packages/server/src/domain/hub/observer.ts:2:subscribeAllChatEvents"],
    ["packages/server/src/domain/hub/bracket-observer.ts:2:subscribeAllChatEvents"],
    [`${DEFINITION}:0:health`],
    [],
    [],
    [],
    [],
  ]);
  expect(firehoseIdentities).toEqual([
    ["packages/server/src/domain/buddy/observer.ts:1:subscribeAllChatEvents:packages/server/src/domain/buddy/observer.ts"],
    ["packages/server/src/infra/relay.ts:1:subscribeAllChatEvents:packages/server/src/infra/relay.ts"],
    ["packages/server/src/domain/hub/observer.ts:2:subscribeAllChatEvents:packages/server/src/domain/hub/observer.ts"],
    ["packages/server/src/domain/hub/bracket-observer.ts:2:subscribeAllChatEvents:packages/server/src/domain/hub/bracket-observer.ts"],
    [],
    ["packages/server/src/entry/compose/automation-watcher.ts:1:subscribeAllChatEvents:packages/server/src/entry/compose/automation-watcher.ts"],
    ["packages/server/src/transport/trpc/index.ts:1:subscribeAllChatEvents:packages/server/src/transport/trpc/index.ts"],
    [],
    [],
  ]);
  expect(healthIdentities).toEqual([[], [], [], [], ["packages/server/src/entry/compose/automation-watcher.ts:1"], [], [], [], []]);
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
