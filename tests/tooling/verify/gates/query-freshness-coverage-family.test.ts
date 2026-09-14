import process from "node:process";
import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GateOwnerResult, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as coverage } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { gate as debt } from "../../../../tooling/src/verify/gates/query-freshness-coverage-debt.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/query-freshness-coverage-health.ts";
import { coordinateGateAuthority } from "../../../../tooling/src/verify/lib/gate-authority.ts";
import { repoRel, runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { frozenLegacyGate } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/query-freshness-family";
const BASE = "197f938de";
const LEGACY_PATH = "tooling/src/verify/gates/query-freshness-coverage.ts";
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
  "admin.vllmEngines",
  "notifications.presence",
  "notifications.list",
  "workloads.list",
  "workloads.listSchedules",
  "admin.listUsers",
  "admin.listSessions",
  "settings.getAppSettings",
  "settings.getAppSettingsWithOverrides",
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

test("the coverage, blindness, and #1965 debt owners pass all declared proofs", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});

test("all thirteen frozen rows preserve exact findings and classify the grant and health transformations", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const examples = [...legacy.mustFlag, ...legacy.mustPass];
  expect(examples).toHaveLength(13);
  const legacyCounts = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0] as const;
  const finalCounts = [1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0] as const;
  const central = reviewedGrantsFor(POLICIES);
  const notifications = central.filter(({ subject }) => subject === "notifications.list");
  expect(notifications).toHaveLength(1);
  const notification = notifications[0];
  if (notification === undefined) {
    throw new Error("missing notifications.list production grant");
  }
  const legacyIdentities: string[][] = [];
  const finalIdentities: string[][] = [];
  const legacyFullIdentities: unknown[][] = [];
  const finalFullIdentities: unknown[][] = [];
  for (const [index, example] of examples.entries()) {
    const expectedLegacy = legacyCounts[index];
    const expectedFinal = finalCounts[index];
    if (expectedLegacy === undefined || expectedFinal === undefined) {
      throw new Error(`unclassified query-freshness row ${index}`);
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
    expect(before.gates[0]?.scan.scanned, example.why).toBe(Object.keys(files).length);
    expect(before.gates[0]?.findings, example.why).toHaveLength(expectedLegacy);
    const after = finalPass(files, index === 5 ? notifications : []);
    expect(after.toolErrors, example.why).toEqual([]);
    expect(after.factErrors, example.why).toEqual([]);
    expect(
      after.policies.flatMap(({ findings }) => findings),
      example.why,
    ).toHaveLength(expectedFinal);
    expect(after.authority.authorityAlarms).toEqual(
      index === 5
        ? [
            {
              kind: "stale-reviewed-grant",
              policyId: coverage.id,
              grantId: notification.id,
              subject: "notifications.list",
              operation: "uncovered-query-freshness",
              message: `reviewed grant was unused after a complete owner run: ${notification.id}`,
            },
          ]
        : [],
    );
    const legacyPopulation = project
      .getSourceFiles()
      .map((source) => repoRel(ROOT, source.getFilePath()))
      .filter((path) => path.startsWith("packages/client/src/"))
      .toSorted();
    const finalPopulation = after.policies.find(({ id }) => id === coverage.id)?.population.effectiveSourcePaths ?? [];
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
            `${file.replace(`${ROOT}/`, "")}:${line}:${token ?? (message?.includes("GAINED") === true ? "stale" : "tripwire")}`,
        )
        .toSorted(),
    );
    finalIdentities.push(
      after.policies.flatMap(({ id, findings }) => findings.map(({ file, line, token }) => `${id}:${file}:${line}:${token ?? "hard"}`)).toSorted(),
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
    column: 18,
    token,
    message: legacy.message,
    fix: legacy.fix,
  });
  const grantCandidate = (file: string, token: string, column: number): unknown => ({
    policyId: coverage.id,
    file,
    line: 1,
    column,
    token,
    message: `${coverage.message} Subject: ${token}, operation: uncovered-query-freshness, line(s): 1.`,
    fix: coverage.fix,
    subject: token,
    operation: "uncovered-query-freshness",
  });
  expect(legacyFullIdentities).toEqual([
    [legacyOccurrence("packages/client/src/features/x/components/x.tsx", "ghost.frozenRead")],
    [legacyOccurrence("packages/client/src/features/x/surfaces/deep/nested/y.tsx", "ghost.pagedRead")],
    [legacyOccurrence("packages/client/src/features/x/components/x.tsx", "ghost.frozenRead")],
    [legacyOccurrence("packages/client/src/features/x/components/x.tsx", "ghost.orphanRead")],
    [legacyOccurrence("packages/client/src/features/x/components/x.tsx", "ghost.propertyCollision")],
    [
      {
        file: "tooling/src/verify/gates/query-freshness-coverage.ts",
        line: 1,
        column: 0,
        token: null,
        message:
          "query-freshness-coverage[notifications.list]: this key GAINED an invalidation row but still carries a STATIC/DEFERRED entry — delete the stale entry in tooling/src/verify/gates/query-freshness-coverage.ts (the ratchet is self-cleaning in BOTH directions; the D50/D107 discipline).",
        fix: legacy.fix,
      },
    ],
    [legacyOccurrence("packages/client/src/features/x/components/x.tsx", "ghost.notTheSeam")],
    [
      {
        file: "tooling/src/verify/gates/query-freshness-coverage.ts",
        line: 1,
        column: 0,
        token: null,
        message:
          "query-freshness-coverage: the Invalidation seam anchor is present but no client module declares `createInvalidation` — the invalidation seam was renamed away, so the coverage side would go vacuous. Re-point SEAM_FACTORY in tooling/src/verify/gates/query-freshness-coverage.ts (path-keyed-gates-die-on-rename; the seam lives at packages/client/src/data/invalidation.ts).",
        fix: legacy.fix,
      },
    ],
    [],
    [],
    [],
    [],
    [],
  ]);
  expect(finalFullIdentities).toEqual([
    [grantCandidate("packages/client/src/features/x/components/x.tsx", "ghost.frozenRead", 23)],
    [grantCandidate("packages/client/src/features/x/surfaces/deep/nested/y.tsx", "ghost.pagedRead", 28)],
    [grantCandidate("packages/client/src/features/x/components/x.tsx", "ghost.frozenRead", 23)],
    [grantCandidate("packages/client/src/features/x/components/x.tsx", "ghost.orphanRead", 23)],
    [grantCandidate("packages/client/src/features/x/components/x.tsx", "ghost.propertyCollision", 23)],
    [],
    [grantCandidate("packages/client/src/features/x/components/x.tsx", "ghost.notTheSeam", 23)],
    [
      {
        policyId: health.id,
        file: "packages/client/src/data/invalidation.ts",
        line: 1,
        column: 18,
        token: "Invalidation",
        message: health.message,
        fix: health.fix,
        subject: null,
        operation: null,
      },
    ],
    [],
    [],
    [],
    [],
    [],
  ]);
  expect(legacyIdentities).toEqual([
    ["packages/client/src/features/x/components/x.tsx:1:ghost.frozenRead"],
    ["packages/client/src/features/x/surfaces/deep/nested/y.tsx:1:ghost.pagedRead"],
    ["packages/client/src/features/x/components/x.tsx:1:ghost.frozenRead"],
    ["packages/client/src/features/x/components/x.tsx:1:ghost.orphanRead"],
    ["packages/client/src/features/x/components/x.tsx:1:ghost.propertyCollision"],
    ["tooling/src/verify/gates/query-freshness-coverage.ts:1:stale"],
    ["packages/client/src/features/x/components/x.tsx:1:ghost.notTheSeam"],
    ["tooling/src/verify/gates/query-freshness-coverage.ts:1:tripwire"],
    [],
    [],
    [],
    [],
    [],
  ]);
  expect(finalIdentities).toEqual([
    ["query-freshness-coverage:packages/client/src/features/x/components/x.tsx:1:ghost.frozenRead"],
    ["query-freshness-coverage:packages/client/src/features/x/surfaces/deep/nested/y.tsx:1:ghost.pagedRead"],
    ["query-freshness-coverage:packages/client/src/features/x/components/x.tsx:1:ghost.frozenRead"],
    ["query-freshness-coverage:packages/client/src/features/x/components/x.tsx:1:ghost.orphanRead"],
    ["query-freshness-coverage:packages/client/src/features/x/components/x.tsx:1:ghost.propertyCollision"],
    [],
    ["query-freshness-coverage:packages/client/src/features/x/components/x.tsx:1:ghost.notTheSeam"],
    ["query-freshness-coverage-health:packages/client/src/data/invalidation.ts:1:Invalidation"],
    [],
    [],
    [],
    [],
    [],
  ]);
});

test("the frozen identifier tripwire survives a type-alias anchor while seam pairing remains interface-specific", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, LEGACY_PATH);
  const files = {
    "packages/client/src/data/invalidation.ts":
      "export type Invalidation = { readonly invalidate: () => void };\nexport function buildInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
    "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.aliasAnchor.queryOptions({});\n",
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
  expect(
    before.gates[0]?.findings.map(({ file, line, column, token, message, fix }) => ({
      file,
      line,
      column,
      token: token ?? null,
      message: message ?? legacy.message,
      fix: fix ?? legacy.fix ?? null,
    })),
  ).toEqual([
    {
      file: "tooling/src/verify/gates/query-freshness-coverage.ts",
      line: 1,
      column: 0,
      token: null,
      message:
        "query-freshness-coverage: the Invalidation seam anchor is present but no client module declares `createInvalidation` — the invalidation seam was renamed away, so the coverage side would go vacuous. Re-point SEAM_FACTORY in tooling/src/verify/gates/query-freshness-coverage.ts (path-keyed-gates-die-on-rename; the seam lives at packages/client/src/data/invalidation.ts).",
      fix: legacy.fix,
    },
  ]);

  const after = finalPass(files);
  expect(after.toolErrors).toEqual([]);
  expect(after.factErrors).toEqual([]);
  expect(
    after.authority.effectiveFindings.map(({ policyId, file, line, column, token, message, fix, subject, operation }) => ({
      policyId,
      file,
      line,
      column,
      token: token ?? null,
      message: message ?? null,
      fix: fix ?? null,
      subject: subject ?? null,
      operation: operation ?? null,
    })),
  ).toEqual([
    {
      policyId: health.id,
      file: "packages/client/src/data/invalidation.ts",
      line: 1,
      column: 13,
      token: "Invalidation",
      message: health.message,
      fix: health.fix,
      subject: null,
      operation: null,
    },
  ]);
});

test("the production freshness population is exactly the legacy client scanRoot", () => {
  const root = process.cwd();
  const project = getWorkspace({ root });
  const result = runPolicyPass({
    knownPolicies: POLICIES,
    policies: POLICIES,
    root,
    project,
    reviewedGrants: reviewedGrantsFor(POLICIES),
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  const finalPopulation = result.policies.find(({ id }) => id === coverage.id)?.population.effectiveSourcePaths ?? [];
  const legacyPopulation = project
    .getSourceFiles()
    .map((source) => repoRel(root, source.getFilePath()))
    .filter((path) => path.startsWith("packages/client/src/"))
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
  expect(
    finalPopulation.some((path) => path.startsWith("packages/client/src/features/")),
    "client feature inside control",
  ).toBe(true);
  expect(
    finalPopulation.some((path) => path.startsWith("packages/ui/src/")),
    "UI outside control",
  ).toBe(false);
}, 300_000);

test("all 34 production classifications are exact central grants and #1965 remains independently visible", () => {
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
