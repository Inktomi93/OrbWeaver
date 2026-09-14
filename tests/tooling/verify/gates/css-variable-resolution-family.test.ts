import { Project } from "ts-morph";
import { PRODUCT_STYLESHEETS } from "../../../../tooling/src/verify/contract/css-family.ts";
import type { Finding } from "../../../../tooling/src/verify/contract/gate.ts";
import type { CoordinatedGateFinding, GateAuthorityAlarm, ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { DeclaredScan } from "../../../../tooling/src/verify/contract/pass.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/css-var-defined.ts";
import { CSS_VARIABLE_GRANT_FIXES, gate as grants } from "../../../../tooling/src/verify/gates/css-var-defined-grants.ts";
import { CSS_VARIABLE_HEALTH_FIXES, gate as health } from "../../../../tooling/src/verify/gates/css-var-defined-health.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR, VENDOR_SURFACE_FIXTURE } from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyGateProofs } from "../../../../tooling/src/verify/ops/conformance.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { CssFixture } from "../../../support/css-conversion-differential.ts";
import { completeCssFixture, cssExampleFiles, replayFinalCss, replayLegacyCss } from "../../../support/css-conversion-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { gate as frozenLegacy } from "../legacy-css-var-defined.fixture.ts";

test("the css-variable-resolution family keeps its declared proofs", () => {
  expect(verifyPolicyProofs([ordinary, grants, health])).toEqual([]);
});

test("the frozen pre-conversion corpus remains green", () => {
  expect(verifyGateProofs([frozenLegacy])).toEqual([]);
  expect(frozenLegacy.mustFlag).toHaveLength(21);
  expect(frozenLegacy.mustPass).toHaveLength(5);
});

const CSS_GRANTS = REVIEWED_GRANTS.filter(({ policyId }) => policyId === grants.id);
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

const VENDOR_FILES = {
  ...VENDOR_SURFACE_FIXTURE,
  ...CLEAN_PRODUCT_CSS,
  [SOURCE_ANCHOR]: 'export const probe = <div className="w-(--anchor-width)" />;\n',
  "docs/vendor/base-ui/INDEX.md": "# Base UI docs mirror — v9.9.9\n",
  "docs/vendor/base-ui/components/probe.md": "| `--anchor-width` | `number` | proof |\n",
  "packages/ui/node_modules/@base-ui/react/select/SelectCssVars.d.ts": 'export enum SelectCssVars { width = "--anchor-width" }\n',
} as const;

type VariableDisposition =
  | "identical"
  | "split-health-anchor"
  | "split-health-plus-vendor-membership"
  | "runtime-resource-refusal"
  | "central-grant-liveness-move"
  | "central-grant-candidate-move"
  | "merged-property-vocabulary-into-writer"
  | "vacuous-pass";

interface VariableScenario {
  readonly disposition: VariableDisposition;
  readonly policies: readonly GatePolicy[];
  readonly complete: boolean;
  readonly grants: readonly ReviewedGateGrant[];
  readonly finalAdds?: readonly string[];
  readonly finalDrops?: readonly string[];
  readonly refusalPath?: string;
  readonly dynamicTokenCorrection?: boolean;
}

// Frozen legacy semantic receipts, before and after the explicitly inert resource completion.
// Columns: raw/completed source count, definitions, references, class roots, raw/completed
// mirror documents, vendor properties, used properties, and reference-site memberships.
const VARIABLE_DECLARED_COUNTS = [
  [2, 6, 1, 1, 1, 0, 1, 0, 0, 0],
  [2, 6, 1, 0, 1, 0, 1, 0, 0, 0],
  [2, 6, 1, 1, 1, 2, 2, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [6, 6, 7, 20, 1, 0, 0, 0, 0, 0],
  [6, 10, 7, 20, 1, 2, 2, 0, 0, 0],
  [6, 10, 7, 7, 1, 2, 2, 13, 0, 0],
  [6, 10, 7, 21, 1, 2, 2, 14, 14, 14],
  [6, 10, 7, 19, 1, 2, 2, 13, 12, 12],
  [6, 10, 7, 20, 1, 2, 2, 13, 13, 13],
  [7, 11, 8, 21, 1, 2, 2, 13, 13, 13],
  [7, 11, 7, 20, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [6, 10, 7, 19, 1, 2, 2, 13, 13, 13],
  [2, 6, 0, 1, 1, 0, 1, 0, 0, 0],
  [2, 6, 1, 0, 1, 0, 1, 0, 0, 0],
  [1, 6, 1, 1, 0, 0, 1, 0, 0, 0],
  [3, 6, 2, 3, 1, 0, 1, 0, 0, 0],
  [3, 6, 1, 2, 1, 0, 1, 0, 0, 0],
  [2, 6, 1, 1, 1, 0, 1, 0, 0, 0],
  [2, 6, 1, 1, 1, 2, 2, 1, 1, 1],
  [6, 10, 7, 20, 1, 2, 2, 13, 13, 13],
] as const;

const ALL_VARIABLE_POLICIES = [ordinary, grants, health] as const;
const VARIABLE_SCENARIOS: readonly VariableScenario[] = [
  { disposition: "identical", policies: [ordinary], complete: true, grants: [] },
  {
    disposition: "split-health-plus-vendor-membership",
    policies: [ordinary, health],
    complete: true,
    grants: [],
    finalAdds: ["health:zero:Base UI reference-site memberships", "health:zero:documented Base UI properties"],
    dynamicTokenCorrection: true,
  },
  { disposition: "split-health-anchor", policies: [health], complete: true, grants: [] },
  { disposition: "runtime-resource-refusal", policies: ALL_VARIABLE_POLICIES, complete: false, grants: CSS_GRANTS, refusalPath: PRODUCT_STYLESHEETS[0] },
  { disposition: "runtime-resource-refusal", policies: ALL_VARIABLE_POLICIES, complete: false, grants: CSS_GRANTS, refusalPath: PRODUCT_STYLESHEETS[1] },
  { disposition: "central-grant-liveness-move", policies: [grants, health], complete: true, grants: CSS_GRANTS },
  { disposition: "central-grant-liveness-move", policies: [grants, health], complete: true, grants: CSS_GRANTS },
  { disposition: "central-grant-candidate-move", policies: [grants], complete: true, grants: CSS_GRANTS },
  { disposition: "central-grant-liveness-move", policies: [grants], complete: true, grants: CSS_GRANTS },
  { disposition: "split-health-anchor", policies: [health], complete: true, grants: [] },
  {
    disposition: "merged-property-vocabulary-into-writer",
    policies: [grants],
    complete: true,
    grants: CSS_GRANTS,
    finalDrops: ["retired-runtime-property:--new-runtime"],
  },
  { disposition: "central-grant-candidate-move", policies: [grants], complete: true, grants: CSS_GRANTS },
  ...Array.from(
    { length: 6 },
    (): VariableScenario => ({
      disposition: "central-grant-liveness-move",
      policies: [grants],
      complete: true,
      grants: CSS_GRANTS,
    }),
  ),
  {
    disposition: "split-health-plus-vendor-membership",
    policies: [health],
    complete: true,
    grants: [],
    finalAdds: ["health:zero:Base UI reference-site memberships", "health:zero:documented Base UI properties"],
  },
  {
    disposition: "split-health-plus-vendor-membership",
    policies: [health],
    complete: true,
    grants: [],
    finalAdds: ["health:zero:Base UI reference-site memberships", "health:zero:documented Base UI properties"],
  },
  {
    disposition: "split-health-plus-vendor-membership",
    policies: [health],
    complete: true,
    grants: [],
    finalAdds: ["health:zero:Base UI reference-site memberships", "health:zero:documented Base UI properties"],
  },
  { disposition: "vacuous-pass", policies: [ordinary], complete: true, grants: [] },
  { disposition: "vacuous-pass", policies: [ordinary], complete: true, grants: [] },
  { disposition: "vacuous-pass", policies: [ordinary], complete: true, grants: [] },
  { disposition: "vacuous-pass", policies: [ordinary, grants], complete: true, grants: CSS_GRANTS.filter(({ subject }) => subject === "--anchor-width") },
  { disposition: "vacuous-pass", policies: ALL_VARIABLE_POLICIES, complete: true, grants: CSS_GRANTS },
];

function semanticHealth(message: string): string | null {
  const zero = /(?:scanned|measured) zero (?<population>[^—]+?)(?: on the real tree)? —/u.exec(message)?.groups?.["population"]?.trim();
  if (zero !== undefined) {
    return `health:zero:${zero}`;
  }
  if (message.includes("API-table custom properties")) {
    return "health:api-mismatch";
  }
  if (message.includes("mirror/package version mismatch")) {
    return "health:version-mismatch";
  }
  return null;
}

function variableGrantId(subject: string, operation: string): string {
  const row = CSS_GRANTS.find((grant) => grant.subject === subject && grant.operation === operation);
  if (row === undefined) {
    throw new Error(`no production CSS-variable grant matches ${subject} / ${operation}`);
  }
  return row.id;
}

function legacyVariableIdentity(finding: Finding): string {
  const message = finding.message ?? frozenLegacy.message;
  const healthIdentity = semanticHealth(message);
  if (healthIdentity !== null) {
    return healthIdentity;
  }
  if (message.includes("does not have a statically proved value source")) {
    return `ordinary:${finding.file}:${String(finding.line)}:${String(finding.column)}:${finding.token ?? "-"}`;
  }
  if (message.includes("allowed Base UI runtime property no file uses")) {
    return `stale:css-var-defined-grants:${(finding.token ?? "").slice(2)}`;
  }
  if (message.includes("Base UI runtime property this tree now uses")) {
    return `candidate:${finding.token ?? "-"}:${"base-ui-runtime-property"}`;
  }
  if (message.includes("is set at runtime and read by this tree")) {
    return `retired-runtime-property:${finding.token ?? "-"}`;
  }
  if (message.includes("is written here and no reviewed producer row")) {
    return `candidate:${finding.file}:css-runtime-writer:${finding.token ?? "-"}`;
  }
  if (message.includes("no longer writes")) {
    const token = finding.token ?? "";
    const split = token.lastIndexOf(":--");
    const subject = token.slice(0, split);
    const operation = `css-runtime-writer:${token.slice(split + 1)}`;
    return `stale:${variableGrantId(subject, operation)}`;
  }
  throw new Error(`unclassified frozen CSS-variable finding: ${message}`);
}

function finalVariableIdentity(finding: CoordinatedGateFinding): string {
  const message = finding.message ?? "";
  const healthIdentity = semanticHealth(message);
  if (healthIdentity !== null) {
    return healthIdentity;
  }
  if (finding.policyId === ordinary.id) {
    return `ordinary:${finding.file}:${String(finding.line)}:${String(finding.column)}:${finding.token ?? "-"}`;
  }
  if (finding.policyId === grants.id && finding.subject !== undefined && finding.operation !== undefined) {
    return `candidate:${finding.subject}:${finding.operation}`;
  }
  throw new Error(`unclassified final CSS-variable finding: ${finding.policyId} ${message}`);
}

function alarmIdentity(alarm: GateAuthorityAlarm): string {
  if (alarm.kind !== "stale-reviewed-grant") {
    throw new Error(`unexpected CSS-variable authority alarm: ${alarm.kind}`);
  }
  return `stale:${alarm.grantId}`;
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].toSorted((left, right) => left.localeCompare(right));
}

function expectedFinalResourcePaths(files: CssFixture): readonly string[] {
  return [...PRODUCT_STYLESHEETS, ...Object.keys(files).filter((path) => path.startsWith("docs/vendor/base-ui/") && path.endsWith(".md"))].toSorted();
}

function expectedFinalSourcePaths(files: CssFixture): readonly string[] {
  return Object.keys(files)
    .filter((path) => /^packages\/(?:client|ui)\/src\/.*\.tsx?$/u.test(path))
    .toSorted();
}

function refusalErrors(policies: readonly GatePolicy[], missingPath: string): readonly string[] {
  return sorted(
    policies.flatMap(({ id }) => [
      `${id}/population:resource declaration product-css is missing: resource is absent from the invocation inventory: ${missingPath}`,
      `${id}/authority:owner was incomplete for ${id}: population: resource declaration product-css is missing: resource is absent from the invocation inventory: ${missingPath}`,
    ]),
  );
}

test("all 26 frozen rows preserve finding identity, error outcome and population under the final family", () => {
  const examples = [...frozenLegacy.mustFlag, ...frozenLegacy.mustPass];
  expect(VARIABLE_SCENARIOS).toHaveLength(26);
  for (const [index, scenario] of VARIABLE_SCENARIOS.entries()) {
    const rawFiles = cssExampleFiles(examples[index] as (typeof examples)[number]);
    const files = scenario.complete ? completeCssFixture(rawFiles, true) : rawFiles;
    const rawLegacy = replayLegacyCss(frozenLegacy, rawFiles);
    const legacy = replayLegacyCss(frozenLegacy, files);
    const final = replayFinalCss(scenario.policies, files, scenario.grants);
    const label = `row ${String(index)} (${scenario.disposition}): ${examples[index]?.why ?? "missing"}`;

    expect(sorted(legacy.findings.map(legacyVariableIdentity)), `${label} — the completion is legacy-inert`).toEqual(
      sorted(rawLegacy.findings.map(legacyVariableIdentity)),
    );
    expect(legacy.toolErrors, `${label} — legacy tool errors`).toEqual(rawLegacy.toolErrors);
    // The legacy runner exposes measured counts, not resource/path membership. CSS and
    // vendor files are read by its run hook and must not be invented as shared-walk inputs.
    const sourceInputs = Object.keys(files).filter((path) => /\.tsx?$/u.test(path) && !path.includes("/node_modules/"));
    expect(legacy.scan, `${label} — actual frozen shared-walk census`).toMatchObject({
      candidates: sourceInputs.length,
      scanned: sourceInputs.length,
      skipped: 0,
    });

    const declared = VARIABLE_DECLARED_COUNTS[index];
    if (declared === undefined) {
      throw new Error(`missing frozen variable population receipt ${String(index)}`);
    }
    const [rawSources, sources, definitions, references, roots, rawDocs, docs, properties, used, memberships] = declared;
    const expectedDeclared = (sourceCount: number, mirrorCount: number): DeclaredScan => ({
      unit: `css variable [sources=${sourceCount} definitions=${definitions} references=${references} classRoots=${roots} vendorDocs=${mirrorCount} vendorProperties=${properties} vendorUsed=${used} vendorMemberships=${memberships}]`,
      candidates: references,
      scanned: references,
      skipReasons: {},
    });
    expect(rawLegacy.scan.declared, `${label} — frozen semantic populations`).toEqual(expectedDeclared(rawSources, rawDocs));
    expect(legacy.scan.declared, `${label} — completed semantic populations`).toEqual(expectedDeclared(sources, docs));

    const before = legacy.findings.map(legacyVariableIdentity);
    const corrected = scenario.dynamicTokenCorrection === true ? before.map((identity) => identity.replace(":dynamic-custom-property", ":z-")) : before;
    const expected = corrected.filter((identity) => !(scenario.finalDrops ?? []).includes(identity)).concat(scenario.finalAdds ?? []);
    const after = [...final.findings.map(finalVariableIdentity), ...final.alarms.map(alarmIdentity)];

    const expectedFinal =
      scenario.refusalPath === undefined
        ? {
            findings: sorted(expected),
            grantAccounting: scenario.grants.map(({ id }) => id).toSorted(),
            toolErrors: [],
            sourcePaths: expectedFinalSourcePaths(files),
            resourcePaths: expectedFinalResourcePaths(files),
          }
        : {
            findings: [],
            grantAccounting: [],
            toolErrors: refusalErrors(scenario.policies, scenario.refusalPath),
            sourcePaths: [],
            resourcePaths: [],
          };
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

test("the conversion installs exactly the 13 vendor and 6 runtime-writer grant identities", () => {
  expect(CSS_GRANTS).toHaveLength(19);
  expect(new Set(CSS_GRANTS.map(({ subject, operation }) => `${subject} ${operation}`)).size).toBe(19);
});

function finalProofFiles(proof: { readonly files: string | Readonly<Record<string, string>>; readonly at?: string }): CssFixture {
  return typeof proof.files === "string" ? { [proof.at ?? SOURCE_ANCHOR]: proof.files } : proof.files;
}

test("all nine legacy remedy obligations remain actionable in production findings and central grant rows", () => {
  const sourceFiles = Object.fromEntries(Object.entries(VENDOR_FILES).filter(([path]) => path !== SOURCE_ANCHOR));
  const emptySource = replayFinalCss([health], sourceFiles, []);
  const mirrorFiles = Object.fromEntries(Object.entries(VENDOR_FILES).filter(([path]) => !path.startsWith("docs/vendor/base-ui/")));
  const emptyMirror = replayFinalCss([health], mirrorFiles, []);
  const definitions = replayFinalCss(
    [health],
    completeCssFixture(cssExampleFiles(frozenLegacy.mustFlag[18] as (typeof frozenLegacy.mustFlag)[number]), true),
    [],
  );
  const version = replayFinalCss([health], finalProofFiles(health.mustFlag[1] as Parameters<typeof finalProofFiles>[0]), []);
  const apiFiles = completeCssFixture(cssExampleFiles(frozenLegacy.mustFlag[2] as (typeof frozenLegacy.mustFlag)[number]), true);
  const api = replayFinalCss([health], apiFiles, []);
  const vendor = replayFinalCss([grants], finalProofFiles(grants.mustFlag[0] as Parameters<typeof finalProofFiles>[0]), []);
  const runtime = replayFinalCss([grants], finalProofFiles(grants.mustFlag[1] as Parameters<typeof finalProofFiles>[0]), []);
  const vendorGrant = CSS_GRANTS.find(({ subject }) => subject === "--anchor-width");
  const runtimeGrant = CSS_GRANTS.find(({ subject }) => subject === "packages/client/src/features/app-shell/surfaces/app-shell.tsx");
  expect(definitions.findings.find(({ message }) => String(message).includes("zero custom-property definitions"))?.fix).toBe(
    CSS_VARIABLE_HEALTH_FIXES.population,
  );
  // These failures now belong to population acquisition, before a policy can emit its fix.
  // Assert the emitted owner and missing input rather than borrowing unreachable descriptor text.
  expect(emptySource.findings).toEqual([]);
  expect(emptySource.toolErrors).toEqual([
    "css-var-defined-health/authority:owner was incomplete for css-var-defined-health: population: Invalid population resolution: candidate corpus is empty",
    "css-var-defined-health/population:Invalid population resolution: candidate corpus is empty",
  ]);
  expect(emptyMirror.findings).toEqual([]);
  expect(emptyMirror.toolErrors).toEqual([
    "css-var-defined-health/authority:owner was incomplete for css-var-defined-health: population: resource declaration vendor-css-surface is missing: the Base UI docs mirror docs/vendor/base-ui is unavailable: resource tree has no members: docs/vendor/base-ui",
    "css-var-defined-health/population:resource declaration vendor-css-surface is missing: the Base UI docs mirror docs/vendor/base-ui is unavailable: resource tree has no members: docs/vendor/base-ui",
  ]);
  expect(replayFinalCss([health], VENDOR_FILES, []).toolErrors).toEqual([]);
  expect(version.findings.find(({ message }) => String(message).includes("version mismatch"))?.fix).toBe(CSS_VARIABLE_HEALTH_FIXES.version);
  expect(api.findings.find(({ message }) => String(message).includes("API-table custom properties"))?.fix).toBe(CSS_VARIABLE_HEALTH_FIXES.api);
  expect(vendor.findings[0]?.fix).toBe(CSS_VARIABLE_GRANT_FIXES.vendor);
  expect(vendorGrant?.endsWhen).toContain("Delete the unused central grant");
  expect(runtime.findings[0]?.fix).toContain("Review the live property");
  expect(runtime.findings[0]?.fix).toContain("this exact CSSProperties writer");
  expect(runtimeGrant?.endsWhen).toContain("Delete the stale producer grant or review and repoint it");
});

test("the exact vendor grant is consumed once", async ({ plantedTree }) => {
  const exact = CSS_GRANTS.filter(({ subject }) => subject === "--anchor-width");
  const result = run(await plantedTree(VENDOR_FILES), exact);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(1);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === ordinary.id || policyId === grants.id || policyId === health.id)).toEqual([]);
});

test("a wrong operation licenses nothing and goes stale", async ({ plantedTree }) => {
  const wrong = CSS_GRANTS.filter(({ subject }) => subject === "--anchor-width").map((row) => ({ ...row, operation: "wrong" }));
  const result = run(await plantedTree(VENDOR_FILES), wrong);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("two uses of one vendor property remain one grant candidate", async ({ plantedTree }) => {
  const exact = CSS_GRANTS.filter(({ subject }) => subject === "--anchor-width");
  const files = {
    ...VENDOR_FILES,
    [SOURCE_ANCHOR]: 'export const probe = <><div className="w-(--anchor-width)" /><div className="h-(--anchor-width)" /></>;\n',
  };
  const result = run(await plantedTree(files), exact);
  expect(result.authority.grantedFindings).toHaveLength(1);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("duplicate central identities are refused", async ({ plantedTree }) => {
  const [exact] = CSS_GRANTS.filter(({ subject }) => subject === "--anchor-width");
  if (exact === undefined) {
    throw new Error("missing anchor-width grant");
  }
  const result = run(await plantedTree(VENDOR_FILES), [exact, { ...exact, id: `${exact.id}-duplicate` }]);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.toolErrors.map(({ kind }) => kind)).toEqual(["duplicate-grant-identity"]);
});

test("the final family reaches a clean verdict over the real frontend and consumes all 19 reviewed identities", () => {
  const result = run(REPO_ROOT, CSS_GRANTS);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.filter(({ policyId }) => policyId === ordinary.id || policyId === grants.id || policyId === health.id)).toEqual([]);
  expect(result.authority.grantedFindings).toHaveLength(19);
}, 30_000);
