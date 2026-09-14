import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as seals } from "../../../../tooling/src/verify/gates/query-machine-seals.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/query-machine-seals-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { repoRel, runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/query-machine-seals-family";
const BASE = "197f938de";
const LEGACY_PATH = "tooling/src/verify/gates/query-machine-seals.ts";
const POLICIES = [seals, health] as const;
const GRANTS: readonly ReviewedGateGrant[] = reviewedGrantsFor(POLICIES);
const EXPECTED_GRANT_IDENTITIES = [
  ["query-machine-seals:create-entity-mutation", "packages/client/src/data/create-entity-mutation.ts", "raw-useMutation-import"],
  ["query-machine-seals:create-collection-surface", "packages/client/src/data/create-collection-surface.ts", "raw-useInfiniteQuery-import"],
  ["query-machine-seals:ct-stories", "tests/client/lib/_ct-stories.tsx", "raw-useMutation-import"],
] as const;

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
function completedFiles(files: Readonly<Record<string, string>>, index: number): Readonly<Record<string, string>> {
  return index === 6
    ? {
        ...files,
        "packages/client/src/data/index.ts": "export const QueryBoundary = null;\n",
        "packages/client/src/data/create-collection-surface.ts": "import { useInfiniteQuery } from '@tanstack/react-query';\n",
      }
    : files;
}

test("both query-machine owners pass their declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("all eight frozen rows preserve exact findings and classify the grant and health splits", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(8);
  const legacyCounts = [1, 1, 1, 1, 0, 0, 0, 0] as const;
  const rawCounts = [1, 1, 1, 1, 1, 1, 1, 1] as const;
  const effectiveCounts = [1, 1, 1, 1, 0, 0, 0, 0] as const;
  const grantByRow: Readonly<Record<number, string>> = {
    4: "query-machine-seals:create-entity-mutation",
    5: "query-machine-seals:create-collection-surface",
    6: "query-machine-seals:create-collection-surface",
    7: "query-machine-seals:create-collection-surface",
  };
  const legacyIdentities: string[][] = [];
  const finalIdentities: string[][] = [];
  const legacyFullIdentities: unknown[][] = [];
  const finalFullIdentities: unknown[][] = [];
  for (const [index, example] of examples.entries()) {
    const expectedLegacy = legacyCounts[index];
    const expectedRaw = rawCounts[index];
    const expectedEffective = effectiveCounts[index];
    if (expectedLegacy === undefined || expectedRaw === undefined || expectedEffective === undefined) {
      throw new Error(`unclassified query-machine row ${index}`);
    }
    const files = completedFiles(filesOf(example), index);
    const project = projectOf(files);
    const before = runPass([legacy], {
      root: ROOT,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
    expect(before.toolErrors, example.why).toEqual([]);
    expect(before.gates[0]?.findings, example.why).toHaveLength(expectedLegacy);
    expect(before.gates[0]?.scan.scanned, example.why).toBe(Object.keys(files).length);
    const grantId = grantByRow[index];
    const after = finalPass(
      files,
      GRANTS.filter(({ id }) => id === grantId),
    );
    expect(after.toolErrors, example.why).toEqual([]);
    expect(after.factErrors, example.why).toEqual([]);
    expect(
      after.policies.flatMap(({ findings }) => findings),
      example.why,
    ).toHaveLength(expectedRaw);
    expect(after.authority.effectiveFindings, example.why).toHaveLength(expectedEffective);
    const candidatePaths = project
      .getSourceFiles()
      .map((source) => repoRel(ROOT, source.getFilePath()))
      .toSorted();
    const legacyPopulation = candidatePaths.filter((path) => !/\.test\.tsx?$/u.test(path));
    const finalPopulation = after.policies.find(({ id }) => id === seals.id)?.population.effectiveSourcePaths ?? [];
    expect(
      legacyPopulation.filter((path) => !finalPopulation.includes(path)),
      `${example.why}: legacy minus final`,
    ).toEqual([]);
    expect(
      finalPopulation.filter((path) => !legacyPopulation.includes(path)),
      `${example.why}: final minus legacy`,
    ).toEqual([]);
    legacyIdentities.push(
      (before.gates[0]?.findings ?? [])
        .map(
          ({ file, line, token, message }) =>
            `${file.replace(`${ROOT}/`, "")}:${line}:${token ?? (message?.includes("no longer imports") === true ? "unused" : "gone")}`,
        )
        .toSorted(),
    );
    finalIdentities.push(
      after.policies
        .flatMap(({ id, findings }) => findings.map(({ file, line, token, subject }) => `${id}:${file}:${line}:${token ?? "health"}:${subject ?? "hard"}`))
        .toSorted(),
    );
    legacyFullIdentities.push(
      (before.gates[0]?.findings ?? []).map(({ file, line, column, token, message, fix }) => ({
        file: file.replace(`${ROOT}/`, ""),
        line,
        column,
        token: token ?? null,
        message: message ?? legacy.message,
        fix: fix ?? legacy.fix ?? null,
      })),
    );
    finalFullIdentities.push(
      after.policies.flatMap(({ id, findings }) => {
        const policy = POLICIES.find((candidate) => candidate.id === id);
        return findings.map(({ file, line, column, token, message, fix, subject, operation }) => ({
          policyId: id,
          file,
          line,
          column,
          token: token ?? null,
          message: message ?? policy?.message ?? null,
          fix: fix ?? policy?.fix ?? null,
          subject: subject ?? null,
          operation: operation ?? null,
        }));
      }),
    );
  }
  const legacyOccurrence = (file: string, token: string): unknown => ({
    file,
    line: 1,
    column: 1,
    token,
    message: legacy.message,
    fix: legacy.fix,
  });
  const grantCandidate = (file: string, token: string, operation: string): unknown => ({
    policyId: seals.id,
    file,
    line: 1,
    column: 10,
    token,
    message: `${seals.message} Subject: ${file}, operation: ${operation}, line(s): 1.`,
    fix: seals.fix,
    subject: file,
    operation,
  });
  expect(legacyFullIdentities).toEqual([
    [legacyOccurrence("packages/client/src/components/foo.tsx", "useMutation")],
    [legacyOccurrence("packages/client/src/data/other.ts", "useInfiniteQuery")],
    [
      {
        file: "tooling/src/verify/gates/query-machine-seals.ts",
        line: 1,
        column: 0,
        token: null,
        message:
          'stale EXEMPT_COLLECTION — the named factory no longer imports `useInfiniteQuery`, so the exemption points at nothing while the file that DOES own the raw call goes unsealed (ratchet down): "packages/client/src/data/create-collection-surface.ts" — re-point the row in tooling/src/verify/gates/query-machine-seals.ts',
        fix: legacy.fix,
      },
    ],
    [
      {
        file: "tooling/src/verify/gates/query-machine-seals.ts",
        line: 1,
        column: 0,
        token: null,
        message:
          'stale EXEMPT_COLLECTION — the sole paginated-browse factory is no longer in the project (ratchet down): "packages/client/src/data/create-collection-surface.ts" — delete or re-point the row in tooling/src/verify/gates/query-machine-seals.ts',
        fix: legacy.fix,
      },
    ],
    [],
    [],
    [],
    [],
  ]);
  expect(finalFullIdentities).toEqual([
    [grantCandidate("packages/client/src/components/foo.tsx", "useMutation", "raw-useMutation-import")],
    [grantCandidate("packages/client/src/data/other.ts", "useInfiniteQuery", "raw-useInfiniteQuery-import")],
    [
      {
        policyId: health.id,
        file: "packages/client/src/data/create-collection-surface.ts",
        line: 1,
        column: 1,
        token: "export",
        message: `${health.message} packages/client/src/data/create-collection-surface.ts no longer imports useInfiniteQuery.`,
        fix: health.fix,
        subject: null,
        operation: null,
      },
    ],
    [
      {
        policyId: health.id,
        file: "packages/client/src/data/index.ts",
        line: 1,
        column: 1,
        token: "export",
        message: `${health.message} Missing: packages/client/src/data/create-collection-surface.ts.`,
        fix: health.fix,
        subject: null,
        operation: null,
      },
    ],
    [grantCandidate("packages/client/src/data/create-entity-mutation.ts", "useMutation", "raw-useMutation-import")],
    [grantCandidate("packages/client/src/data/create-collection-surface.ts", "useInfiniteQuery", "raw-useInfiniteQuery-import")],
    [grantCandidate("packages/client/src/data/create-collection-surface.ts", "useInfiniteQuery", "raw-useInfiniteQuery-import")],
    [grantCandidate("packages/client/src/data/create-collection-surface.ts", "useInfiniteQuery", "raw-useInfiniteQuery-import")],
  ]);
  expect(legacyIdentities).toEqual([
    ["packages/client/src/components/foo.tsx:1:useMutation"],
    ["packages/client/src/data/other.ts:1:useInfiniteQuery"],
    ["tooling/src/verify/gates/query-machine-seals.ts:1:unused"],
    ["tooling/src/verify/gates/query-machine-seals.ts:1:gone"],
    [],
    [],
    [],
    [],
  ]);
  expect(finalIdentities).toEqual([
    ["query-machine-seals:packages/client/src/components/foo.tsx:1:useMutation:packages/client/src/components/foo.tsx"],
    ["query-machine-seals:packages/client/src/data/other.ts:1:useInfiniteQuery:packages/client/src/data/other.ts"],
    ["query-machine-seals-health:packages/client/src/data/create-collection-surface.ts:1:export:hard"],
    ["query-machine-seals-health:packages/client/src/data/index.ts:1:export:hard"],
    ["query-machine-seals:packages/client/src/data/create-entity-mutation.ts:1:useMutation:packages/client/src/data/create-entity-mutation.ts"],
    ["query-machine-seals:packages/client/src/data/create-collection-surface.ts:1:useInfiniteQuery:packages/client/src/data/create-collection-surface.ts"],
    ["query-machine-seals:packages/client/src/data/create-collection-surface.ts:1:useInfiniteQuery:packages/client/src/data/create-collection-surface.ts"],
    ["query-machine-seals:packages/client/src/data/create-collection-surface.ts:1:useInfiniteQuery:packages/client/src/data/create-collection-surface.ts"],
  ]);
});

test("the frozen legacy descriptor and final family both catch the former UI population hole", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const files = {
    "packages/client/src/data/index.ts": "export const QueryBoundary = null;\n",
    "packages/client/src/data/create-collection-surface.ts": "import { useInfiniteQuery } from '@tanstack/react-query';\nexport const c = useInfiniteQuery;\n",
    "packages/ui/src/raw.tsx": "import { useMutation } from '@tanstack/react-query';\n",
  };
  const project = projectOf(files);
  const before = runPass([legacy], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  expect(before.toolErrors).toEqual([]);
  expect(before.gates[0]?.findings.map(({ file, line, token }) => `${file.replace(`${ROOT}/`, "")}:${line}:${token}`)).toEqual([
    "packages/ui/src/raw.tsx:1:useMutation",
  ]);

  const after = finalPass(
    files,
    GRANTS.filter(({ id }) => id === "query-machine-seals:create-collection-surface"),
  );
  expect(after.toolErrors).toEqual([]);
  expect(after.factErrors).toEqual([]);
  expect(after.authority.effectiveFindings.map(({ policyId, file, line, token }) => `${policyId}:${file}:${line}:${token}`)).toEqual([
    "query-machine-seals:packages/ui/src/raw.tsx:1:useMutation",
  ]);
});

test("the production occurrence population is exactly the legacy harness population after test scope", () => {
  const root = process.cwd();
  const project = getWorkspace({ root });
  const result = runPolicyPass({ knownPolicies: POLICIES, policies: POLICIES, root, project, reviewedGrants: GRANTS, failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  const finalPopulation = result.policies.find(({ id }) => id === seals.id)?.population.effectiveSourcePaths ?? [];
  const legacyPopulation = project
    .getSourceFiles()
    .map((source) => repoRel(root, source.getFilePath()))
    .filter((path) => !/\.test\.tsx?$/u.test(path))
    .toSorted();
  const finalSet = new Set(finalPopulation);
  const legacySet = new Set(legacyPopulation);
  expect(
    legacyPopulation.filter((path) => !finalSet.has(path)),
    "legacy minus final",
  ).toEqual([]);
  expect(
    finalPopulation.filter((path) => !legacySet.has(path)),
    "final minus legacy",
  ).toEqual([]);
  for (const prefix of [
    "packages/client/src/",
    "packages/ui/src/",
    "packages/server/src/",
    "packages/db/src/",
    "packages/contracts/src/",
    "packages/kit/src/",
    "packages/showcase-plugins/src/",
    "tooling/src/",
    "tests/",
    "scripts/",
  ]) {
    expect(
      finalPopulation.some((path) => path.startsWith(prefix)),
      `missing admitted root ${prefix}`,
    ).toBe(true);
  }
  expect(
    finalPopulation.some((path) => /\.test\.tsx?$/u.test(path)),
    "test files remain outside the policy scope",
  ).toBe(false);
}, 300_000);

test("the three production candidates bind only their exact hook and home", () => {
  expect(GRANTS.map(({ id, subject, operation }) => [id, subject, operation])).toEqual(EXPECTED_GRANT_IDENTITIES);
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
      GRANTS.map((grant, index) => {
        if (index === 0) {
          return { ...grant, operation: "raw-useInfiniteQuery-import" };
        }
        if (index === 1) {
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
