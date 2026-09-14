import { Project } from "ts-morph";
import { PRODUCT_STYLESHEETS } from "../../../../tooling/src/verify/contract/css-family.ts";
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import type { CoordinatedGateFinding, GateAuthorityAlarm, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { DeclaredScan } from "../../../../tooling/src/verify/contract/pass.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as grants } from "../../../../tooling/src/verify/gates/css-length-tokens-grants.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/css-length-tokens-health.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR } from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { SHELL_STYLESHEET } from "../../../../tooling/src/verify/lib/css-length-policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { completeCssFixture, cssExampleFiles, replayFinalCss, replayLegacyCss } from "../../../support/css-conversion-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { gate as frozenLegacy } from "../legacy-css-length-tokens.fixture.ts";

const LENGTH_GRANTS = REVIEWED_GRANTS.filter(({ policyId }) => policyId === grants.id);
const REPO_ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

function run(root: string, reviewedGrants: readonly ReviewedGateGrant[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([
    `${root}/packages/ui/src/**/*.ts`,
    `${root}/packages/ui/src/**/*.tsx`,
    `${root}/packages/client/src/**/*.ts`,
    `${root}/packages/client/src/**/*.tsx`,
  ]);
  return runPolicyPass({
    knownPolicies: [ordinary, grants, health],
    policies: [ordinary, grants, health],
    root,
    project,
    reviewedGrants,
    failOnWarnings: false,
  });
}

test("the css-length-contract family keeps its final proofs", () => {
  expect(verifyPolicyProofs([ordinary, grants, health])).toEqual([]);
});

test("the complete 28-flag and 3-pass legacy corpus remains green", () => {
  expect(verifyGateProofs([frozenLegacy])).toEqual([]);
  expect(frozenLegacy.mustFlag).toHaveLength(28);
  expect(frozenLegacy.mustPass).toHaveLength(3);
});

test("every one of the 26 structural identities has one exact central grant", () => {
  expect(LENGTH_GRANTS).toHaveLength(26);
  expect(new Set(LENGTH_GRANTS.map(({ subject, operation }) => `${subject} ${operation}`)).size).toBe(26);
});

const DECLARATION_FILES = {
  ...CLEAN_PRODUCT_CSS,
  [SHELL_STYLESHEET]: ".shell-grid { --list-track: 0px; }\n",
  [SOURCE_ANCHOR]: "export const probe = null;\n",
} as const;

type LengthDisposition =
  | "authored-position-token-correction"
  | "central-grant-liveness-move"
  | "runtime-resource-refusal"
  | "reviewed-grant-port"
  | "vacuous-pass";

interface LengthScenario {
  readonly disposition: LengthDisposition;
  readonly policies: readonly GatePolicy[];
  readonly complete: boolean;
  readonly grants: readonly ReviewedGateGrant[];
  readonly refusalPath?: string;
}

const PARTIAL_STRUCTURAL_GRANT_IDS = new Set([
  "css-length-tokens-grants:01",
  "css-length-tokens-grants:02",
  "css-length-tokens-grants:03",
  "css-length-tokens-grants:04",
  "css-length-tokens-grants:05",
  "css-length-tokens-grants:06",
  "css-length-tokens-grants:11",
  "css-length-tokens-grants:12",
  "css-length-tokens-grants:13",
]);
const PARTIAL_STRUCTURAL_GRANTS = LENGTH_GRANTS.filter(({ id }) => PARTIAL_STRUCTURAL_GRANT_IDS.has(id));
// Frozen run-only reader receipts: candidates, scanned values, and raw/completed token skips.
// Null means the original fixture has no CSS declaration scan; completion adds an explicit zero.
const LENGTH_DECLARED_COUNTS = [
  [2, 2, -1, -1],
  [1, 1, 0, 0],
  [1, 1, null, 0],
  [6, 6, -2, -2],
  [0, 0, null, null],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -1, -1],
  [22, 22, -1, -1],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [22, 22, -2, -2],
  [6, 6, -2, -2],
  [1, 0, null, 0],
  [23, 23, -2, -2],
] as const;

const ALL_LENGTH_POLICIES = [ordinary, grants, health] as const;
const LENGTH_SCENARIOS: readonly LengthScenario[] = [
  { disposition: "authored-position-token-correction", policies: [ordinary], complete: true, grants: [] },
  { disposition: "authored-position-token-correction", policies: [ordinary], complete: true, grants: [] },
  { disposition: "authored-position-token-correction", policies: [ordinary], complete: true, grants: [] },
  { disposition: "central-grant-liveness-move", policies: [grants], complete: true, grants: LENGTH_GRANTS },
  { disposition: "runtime-resource-refusal", policies: ALL_LENGTH_POLICIES, complete: false, grants: LENGTH_GRANTS, refusalPath: PRODUCT_STYLESHEETS[0] },
  ...Array.from(
    { length: 23 },
    (): LengthScenario => ({
      disposition: "central-grant-liveness-move",
      policies: [grants],
      complete: true,
      grants: LENGTH_GRANTS,
    }),
  ),
  { disposition: "reviewed-grant-port", policies: [grants], complete: true, grants: PARTIAL_STRUCTURAL_GRANTS },
  { disposition: "vacuous-pass", policies: [ordinary], complete: true, grants: [] },
  { disposition: "vacuous-pass", policies: ALL_LENGTH_POLICIES, complete: true, grants: LENGTH_GRANTS },
];

function sorted(values: readonly string[]): readonly string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right));
}

function structuralGrantId(subject: string): string {
  const row = LENGTH_GRANTS.find((grant) => grant.subject === subject);
  if (row === undefined) {
    throw new Error(`no production structural-length grant matches ${subject}`);
  }
  return row.id;
}

function legacyLengthIdentity(finding: Finding): string {
  const message = finding.message ?? frozenLegacy.message;
  const file = finding.file;
  if (message.includes("allowlist row") || message.includes("structural length allowlist row drifted")) {
    return `stale:${structuralGrantId(finding.token ?? "")}`;
  }
  if (message.includes("raw non-structural CSS length")) {
    const token = finding.token ?? "";
    if (file.endsWith(".css")) {
      return `ordinary:${file}:${String(finding.line)}:${token.split(":", 1)[0] ?? token}`;
    }
    return `ordinary:${file}:${String(finding.line)}:${/\[(?<value>[^\]]+)\]/u.exec(token)?.groups?.["value"] ?? token}`;
  }
  if (message.includes("sanctioned shell stylesheet is missing")) {
    return "health:missing-shell";
  }
  throw new Error(`unclassified frozen CSS-length finding: ${message}`);
}

function finalLengthIdentity(finding: CoordinatedGateFinding): string {
  if (finding.policyId !== ordinary.id) {
    throw new Error(`unexpected final CSS-length finding: ${finding.policyId}`);
  }
  return `ordinary:${finding.file}:${String(finding.line)}:${finding.token ?? ""}`;
}

function lengthAlarmIdentity(alarm: GateAuthorityAlarm): string {
  if (alarm.kind !== "stale-reviewed-grant") {
    throw new Error(`unexpected CSS-length authority alarm: ${alarm.kind}`);
  }
  return `stale:${alarm.grantId}`;
}

function lengthRefusalErrors(policies: readonly GatePolicy[], missingPath: string): readonly string[] {
  return sorted(
    policies.flatMap(({ id }) => [
      `${id}/population:resource declaration product-css is missing: resource is absent from the invocation inventory: ${missingPath}`,
      `${id}/authority:owner was incomplete for ${id}: population: resource declaration product-css is missing: resource is absent from the invocation inventory: ${missingPath}`,
    ]),
  );
}

test("all 31 frozen rows preserve finding identity, error outcome and population under the final family", () => {
  const examples = [...frozenLegacy.mustFlag, ...frozenLegacy.mustPass];
  expect(LENGTH_SCENARIOS).toHaveLength(31);
  expect(PARTIAL_STRUCTURAL_GRANTS.map(({ id }) => id)).toEqual([...PARTIAL_STRUCTURAL_GRANT_IDS]);
  for (const [index, scenario] of LENGTH_SCENARIOS.entries()) {
    const rawFiles = cssExampleFiles(examples[index] as (typeof examples)[number]);
    const files = scenario.complete ? completeCssFixture(rawFiles, false) : rawFiles;
    const rawLegacy = replayLegacyCss(frozenLegacy, rawFiles);
    const legacy = replayLegacyCss(frozenLegacy, files);
    const final = replayFinalCss(scenario.policies, files, scenario.grants);
    const label = `row ${String(index)} (${scenario.disposition}): ${examples[index]?.why ?? "missing"}`;

    expect(sorted(legacy.findings.map(legacyLengthIdentity)), `${label} — the completion is legacy-inert`).toEqual(
      sorted(rawLegacy.findings.map(legacyLengthIdentity)),
    );
    expect(legacy.toolErrors, `${label} — legacy tool errors`).toEqual(rawLegacy.toolErrors);
    const sourceInputs = Object.keys(files).filter((path) => /\.tsx?$/u.test(path) && !path.includes("/node_modules/"));
    const admitted = sourceInputs.filter((path) => path.startsWith("packages/client/src/") || path.startsWith("packages/ui/src/"));
    expect(legacy.scan, `${label} — actual frozen shared-walk census`).toMatchObject({
      candidates: sourceInputs.length,
      scanned: admitted.length,
      skipped: sourceInputs.length - admitted.length,
    });

    const declared = LENGTH_DECLARED_COUNTS[index];
    if (declared === undefined) {
      throw new Error(`missing frozen length population receipt ${String(index)}`);
    }
    const [candidates, scanned, rawTokenSkips, tokenSkips] = declared;
    const expectedDeclared = (skips: number | null): DeclaredScan => ({
      unit: "CSS declaration or static class value",
      candidates,
      scanned,
      skipReasons: { ...(skips === null ? {} : { "token-backed-or-unitless": skips }), "opaque-runtime": 0, "runtime-prefix": 0 },
    });
    expect(rawLegacy.scan.declared, `${label} — frozen semantic populations`).toEqual(expectedDeclared(rawTokenSkips));
    expect(legacy.scan.declared, `${label} — completed semantic populations`).toEqual(expectedDeclared(tokenSkips));

    const before = legacy.findings.map(legacyLengthIdentity);
    const after = [...final.findings.map(finalLengthIdentity), ...final.alarms.map(lengthAlarmIdentity)];
    const expectedFinal =
      scenario.refusalPath === undefined
        ? {
            findings: sorted(before),
            grantAccounting: scenario.grants.map(({ id }) => id).toSorted(),
            toolErrors: [],
            sourcePaths: Object.keys(files)
              .filter((path) => /^packages\/(?:client|ui)\/src\/.*\.tsx?$/u.test(path))
              .toSorted(),
            resourcePaths: [...PRODUCT_STYLESHEETS].toSorted(),
          }
        : { findings: [], grantAccounting: [], toolErrors: lengthRefusalErrors(scenario.policies, scenario.refusalPath), sourcePaths: [], resourcePaths: [] };
    expect(
      {
        findings: sorted(after),
        grantAccounting: [...final.grantedIds, ...final.alarms.flatMap((alarm) => (alarm.kind === "stale-reviewed-grant" ? [alarm.grantId] : []))].toSorted(),
        toolErrors: final.toolErrors,
        sourcePaths: final.sourcePaths,
        resourcePaths: final.resourcePaths,
      },
      `${label} — exact final verdict and population`,
    ).toEqual(expectedFinal);
  }
}, 120_000);

test("an exact structural grant is consumed once, while a wrong operation leaves the candidate effective and stales", async ({ plantedTree }) => {
  const exact = LENGTH_GRANTS.filter(({ subject }) => subject === ".shell-grid { --list-track: 0px }");
  const root = await plantedTree(DECLARATION_FILES);
  const clean = run(root, exact);
  expect(clean.toolErrors).toEqual([]);
  expect(clean.authority.grantedFindings).toHaveLength(1);
  expect(clean.authority.effectiveFindings).toEqual([]);
  const wrong = run(
    root,
    exact.map((row) => ({ ...row, operation: "wrong" })),
  );
  expect(wrong.authority.grantedFindings).toEqual([]);
  expect(wrong.authority.effectiveFindings).toHaveLength(1);
  expect(wrong.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("duplicate structural grant identities withhold the reviewed owner", async ({ plantedTree }) => {
  const [exact] = LENGTH_GRANTS.filter(({ subject }) => subject === ".shell-grid { --list-track: 0px }");
  if (exact === undefined) {
    throw new Error("missing list-track grant");
  }
  const result = run(await plantedTree(DECLARATION_FILES), [exact, { ...exact, id: `${exact.id}-duplicate` }]);
  expect(result.authority.toolErrors.map(({ kind }) => kind)).toEqual(["duplicate-grant-identity"]);
  expect(result.authority.withheldPolicyIds).toContain(grants.id);
});

test("two uses of one structural class recipe remain one grant identity", async ({ plantedTree }) => {
  const subject = "packages/ui/src/markdown/markdown.tsx :: max-h-[60cqh]";
  const exact = LENGTH_GRANTS.filter((row) => row.subject === subject);
  const files = {
    ...CLEAN_PRODUCT_CSS,
    [SOURCE_ANCHOR]: "export const probe = null;\n",
    "packages/ui/src/markdown/markdown.tsx": 'export const proof = <><div className="max-h-[60cqh]" /><div className="max-h-[60cqh]" /></>;\n',
  };
  const result = run(await plantedTree(files), exact);
  expect(result.authority.grantedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("the final family is clean over the real frontend and consumes all 26 structural permissions", () => {
  const result = run(REPO_ROOT, LENGTH_GRANTS);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === ordinary.id || policyId === grants.id || policyId === health.id)).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(26);
}, 30_000);
