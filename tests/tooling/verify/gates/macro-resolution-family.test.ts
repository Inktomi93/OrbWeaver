import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/macro-resolution-health.ts";
import { gate as home } from "../../../../tooling/src/verify/gates/macro-resolution-home.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = "197f938de";
const LEGACY_PATH = "tooling/src/verify/gates/macro-resolution-home.ts";
const ROOT = "/macro-resolution-family";
const POLICIES: readonly GatePolicy[] = [home, health];
const RESOLVERS = ["resolveRowMacros", "processMacros", "createMacroContext", "evaluateMacros", "renderMessageForDisplay"] as const;

function filesOf(example: GateExample): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? "packages/client/src/example.ts"]: example.files } : example.files;
}

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function finalPass(files: Readonly<Record<string, string>>, grants: readonly ReviewedGateGrant[] = []): ReturnType<typeof runPolicyPass> {
  const project = projectOf(files);
  return runPolicyPass({ knownPolicies: POLICIES, policies: POLICIES, root: ROOT, project, reviewedGrants: grants, failOnWarnings: false });
}

function messageNames(message: string | undefined, name: string): boolean {
  return message?.includes(name) === true;
}

test("the macro home and rename-health owners pass their declared production proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("all six frozen macro rows preserve exact sites, observed population, and the classified grant/health splits", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(6);
  const expectedLegacyCounts = [2, 1, 5, 0, 0, 0] as const;
  const expectedFinalRawCounts = [1, 1, 5, 1, 1, 0] as const;
  const expectedFinalEffectiveCounts = [1, 1, 5, 0, 0, 0] as const;
  const expectedLegacyScanned = [2, 2, 1, 1, 2, 2] as const;
  const grants = reviewedGrantsFor(POLICIES);
  const grantSubjectByRow: Readonly<Record<number, string>> = {
    3: "packages/client/src/lib/message-render.ts",
    4: "packages/client/src/features/chat/components/message-content.tsx",
  };
  const legacyIdentities: string[][] = [];
  const homeIdentities: string[][] = [];
  const healthIdentities: string[][] = [];

  for (const [index, example] of examples.entries()) {
    const expectedLegacyCount = expectedLegacyCounts[index];
    const expectedFinalRawCount = expectedFinalRawCounts[index];
    const expectedFinalEffectiveCount = expectedFinalEffectiveCounts[index];
    const expectedScanned = expectedLegacyScanned[index];
    if (
      expectedLegacyCount === undefined ||
      expectedFinalRawCount === undefined ||
      expectedFinalEffectiveCount === undefined ||
      expectedScanned === undefined
    ) {
      throw new Error(`unclassified macro row ${index}`);
    }
    const files = filesOf(example);
    const project = projectOf(files);
    const before = runPass([legacy], {
      root: ROOT,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    expect(before.toolErrors, example.why).toEqual([]);
    expect(before.gates[0]?.scan.scanned, example.why).toBe(expectedScanned);
    expect(before.gates[0]?.findings, example.why).toHaveLength(expectedLegacyCount);

    const subject = grantSubjectByRow[index];
    const after = finalPass(files, subject === undefined ? [] : grants.filter((grant) => grant.subject === subject));
    expect(after.toolErrors, example.why).toEqual([]);
    expect(after.factErrors, example.why).toEqual([]);
    expect(
      after.policies.map(({ owner }) => owner),
      example.why,
    ).toEqual([
      { status: "success", population: "complete" },
      { status: "success", population: "complete" },
    ]);
    const homeResult = after.policies.find(({ id }) => id === home.id);
    const healthResult = after.policies.find(({ id }) => id === health.id);
    expect(
      after.policies.flatMap(({ findings }) => findings),
      example.why,
    ).toHaveLength(expectedFinalRawCount);
    expect(after.authority.effectiveFindings, example.why).toHaveLength(expectedFinalEffectiveCount);
    expect(homeResult?.population.effectiveSourcePaths.length, example.why).toBe(before.gates[0]?.scan.scanned);
    expect(healthResult?.population.effectiveSourcePaths.length, example.why).toBe(project.getSourceFiles().length);

    legacyIdentities.push(
      (before.gates[0]?.findings ?? [])
        .map(({ file, line, token, message }) => `${file.replace(`${ROOT}/`, "")}:${line}:${token ?? RESOLVERS.find((name) => messageNames(message, name))}`)
        .toSorted(),
    );
    homeIdentities.push(
      (homeResult?.findings ?? [])
        .map(
          ({ file, line, subject: findingSubject, message }) =>
            `${file}:${line}:${findingSubject}:${message?.includes(`${file}:1`)}:${message?.includes(`${file}:2`)}`,
        )
        .toSorted(),
    );
    healthIdentities.push(
      (healthResult?.findings ?? []).map(({ file, line, message }) => `${file}:${line}:${RESOLVERS.find((name) => messageNames(message, name))}`).toSorted(),
    );
  }
  expect(legacyIdentities).toEqual([
    [
      "packages/client/src/features/preset/components/section-body-editor.tsx:1:renderMessageForDisplay",
      "packages/client/src/features/preset/components/section-body-editor.tsx:2:renderMessageForDisplay",
    ],
    ["packages/client/src/features/chat/components/injections-manager.tsx:2:processMacros"],
    RESOLVERS.map((name) => `tooling/src/verify/gates/macro-resolution-home.ts:0:${name}`).toSorted((left, right) => left.localeCompare(right)),
    [],
    [],
    [],
  ]);
  expect(homeIdentities).toEqual([
    [
      "packages/client/src/features/preset/components/section-body-editor.tsx:1:packages/client/src/features/preset/components/section-body-editor.tsx:true:true",
    ],
    ["packages/client/src/features/chat/components/injections-manager.tsx:2:packages/client/src/features/chat/components/injections-manager.tsx:false:true"],
    [],
    ["packages/client/src/lib/message-render.ts:1:packages/client/src/lib/message-render.ts:true:true"],
    ["packages/client/src/features/chat/components/message-content.tsx:1:packages/client/src/features/chat/components/message-content.tsx:true:true"],
    [],
  ]);
  expect(healthIdentities).toEqual([
    [],
    [],
    RESOLVERS.map((name) => `packages/client/src/features/chat/components/message-content.tsx:1:${name}`).toSorted((left, right) => left.localeCompare(right)),
    [],
    [],
    [],
  ]);
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
