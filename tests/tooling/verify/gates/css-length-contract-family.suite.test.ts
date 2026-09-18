import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/css-length-tokens.ts";
import { gate as grants } from "../../../../tooling/src/verify/gates/css-length-tokens-grants.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/css-length-tokens-health.ts";
import { CLEAN_PRODUCT_CSS, SOURCE_ANCHOR } from "../../../../tooling/src/verify/lib/css-family-proof-fixtures.ts";
import { SHELL_STYLESHEET } from "../../../../tooling/src/verify/lib/css-length-policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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

test("every one of the 26 structural identities has one exact central grant", () => {
  expect(LENGTH_GRANTS).toHaveLength(26);
  expect(new Set(LENGTH_GRANTS.map(({ subject, operation }) => `${subject} ${operation}`)).size).toBe(26);
});

const DECLARATION_FILES = {
  ...CLEAN_PRODUCT_CSS,
  [SHELL_STYLESHEET]: ".shell-grid { --list-track: 0px; }\n",
  [SOURCE_ANCHOR]: "export const probe = null;\n",
} as const;

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
