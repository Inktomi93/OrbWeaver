import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/css-var-defined.ts";
import { gate as grants } from "../../../../tooling/src/verify/gates/css-var-defined-grants.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/css-var-defined-health.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR, VENDOR_SURFACE_FIXTURE } from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the css-variable-resolution family keeps its declared proofs", () => {
  expect(verifyPolicyProofs([ordinary, grants, health])).toEqual([]);
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

test("the conversion installs exactly the 13 vendor and 6 runtime-writer grant identities", () => {
  expect(CSS_GRANTS).toHaveLength(19);
  expect(new Set(CSS_GRANTS.map(({ subject, operation }) => `${subject} ${operation}`)).size).toBe(19);
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
