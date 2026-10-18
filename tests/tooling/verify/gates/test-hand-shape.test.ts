// test-hand-shape coverage and authority through the production pass: every direct site is judged or UNKNOWN,
// an UNKNOWN is never a finding, and the committed grant table and budget admit no hand shape.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, ts } from "ts-morph";
import { SHAPE_ASSOCIATION_UNKNOWN } from "../../../../tooling/src/floor/code-facts/shape-association-contract.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassInput, PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate } from "../../../../tooling/src/verify/gates/test-hand-shape.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const OWNER = "packages/contracts/src/chat/owner.ts";
const HELPER = "tests/e2e/support/owner.ts";
const OPERATION = `boundary:Hand=${OWNER}#Owner`;

// The coverage assertions name lines in this source; keep its line order.
const HELPER_SOURCE = `import type { Owner } from "../../../packages/contracts/src/chat/owner";
import { take } from "../../../packages/contracts/src/chat/owner";
interface Hand { readonly value: string }
declare const hand: Hand;
declare const loose: any;
declare const maybe: Hand | undefined;
declare const flag: boolean;
export const seen: Owner = hand;
take(loose);
export const carried: Owner | undefined = maybe;
export const kept: boolean = flag;
`;

function pass(repoRoot: string, overrides: Partial<PolicyPassInput> = {}): PolicyPassResult {
  const root = join(repoRoot, ".orb-hand-shape-control");
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  });
  project.createSourceFile(join(root, OWNER), "export interface Owner { readonly value: string }\nexport function take(owner: Owner): void { void owner; }\n");
  project.createSourceFile(join(root, HELPER), HELPER_SOURCE);
  return runPolicyPass({
    root,
    project,
    policies: [gate],
    knownPolicies: [gate],
    reviewedGrants: [],
    failOnWarnings: true,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    ...overrides,
  });
}

test("each direct site is judged or reported UNKNOWN, and only the witnessed production boundary is a finding", ({ repoRoot }) => {
  const result = pass(repoRoot);
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ file: HELPER, line: 3, token: "Hand", operation: OPERATION }]);
  expect(result.authority.verdict).toMatchObject({ errors: 1, blocking: 1 });
  expect(result.policies[0]?.analysis).toEqual({
    supported: 2,
    unknown: [
      { file: HELPER, line: 9, column: 6, token: "loose", reason: SHAPE_ASSOCIATION_UNKNOWN.erasedValue },
      { file: HELPER, line: 10, column: 43, token: "maybe", reason: SHAPE_ASSOCIATION_UNKNOWN.unionHand },
    ],
  });
});

test("the committed grants and budget admit no hand shape: the real table is silent and a new grant row alarms", ({ repoRoot }) => {
  expect(pass(repoRoot, { reviewedGrants: reviewedGrantsFor([gate]), waiverBudget: WAIVER_BUDGET }).authority.authorityAlarms).toEqual([]);
  const planted: ReviewedGateGrant = { id: `${gate.id}:planted`, policyId: gate.id, subject: HELPER, operation: OPERATION, why: "w", endsWhen: "e" };
  const granted = pass(repoRoot, { reviewedGrants: [planted], waiverBudget: WAIVER_BUDGET });
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.authorityAlarms).toMatchObject([{ kind: "waiver-budget", policyId: gate.id, budget: 0, count: 1 }]);
});
